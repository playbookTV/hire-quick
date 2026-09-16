import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { rotateRefreshToken } from '../rotation.js';
import { assertDisposableDatabase } from './assert-disposable-db.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../tokens.js';

const app = createApp();
const userIds: string[] = [];
let setupValidated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  setupValidated = true;
});
afterEach(async () => {
  if (!setupValidated) return;
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS auth_test_reject_revoke ON revoked_tokens',
  );
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS auth_test_reject_revoke()');
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS auth_test_reject_audit ON audit_logs');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS auth_test_reject_audit()');
  // Preserve the append-only audit chain. User deletion cascades denylist rows.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
});
async function fixture() {
  const user = await prisma.user.create({
    data: { role: 'CLIENT', status: 'ACTIVE', phone: `refresh-${randomUUID()}` },
  });
  userIds.push(user.id);
  const token = await signRefreshToken(user.id);
  return { user, token, claims: await verifyRefreshToken(token) };
}
async function refresh(token: string) {
  return request(app).post('/auth/refresh').send({ refreshToken: token });
}

describe('atomic refresh rotation (OVA-138 / TRD §§7,14)', () => {
  it('allows one concurrent successor and rejects reuse without revoking the winning successor', async () => {
    const { user, token, claims } = await fixture();
    const responses = await Promise.all(Array.from({ length: 4 }, () => refresh(token)));
    const winners = responses.filter((response) => response.status === 200);
    expect(winners).toHaveLength(1);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(3);
    expect(await prisma.revokedToken.count({ where: { jti: claims.jti } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { actorId: user.id, action: 'auth.refresh' } }),
    ).toBe(1);
    const pair = winners[0]!.body as { accessToken: string; refreshToken: string };
    expect(await verifyAccessToken(pair.accessToken)).toEqual({ userId: user.id, role: 'CLIENT' });
    expect((await refresh(token)).status).toBe(401);
    expect((await refresh(pair.refreshToken)).status).toBe(200);
  });

  it.each(['access', 'refresh'] as const)(
    'rolls back consumption when %s token signing fails',
    async (failedSigner) => {
      const { user, token, claims } = await fixture();
      const failure = async (): Promise<string> => {
        throw new Error('injected signing failure');
      };
      await expect(
        rotateRefreshToken(token, {
          access: failedSigner === 'access' ? failure : signAccessToken,
          refresh: failedSigner === 'refresh' ? failure : signRefreshToken,
        }),
      ).rejects.toThrow('injected signing failure');
      expect(await prisma.revokedToken.findUnique({ where: { jti: claims.jti } })).toBeNull();
      expect(
        await prisma.auditLog.count({ where: { actorId: user.id, action: 'auth.refresh' } }),
      ).toBe(0);
      expect((await refresh(token)).status).toBe(200);
    },
  );

  it('returns no pair and preserves retry when the denylist insert fails', async () => {
    const { token, claims } = await fixture();
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION auth_test_reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'revocation storage failed'; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER auth_test_reject_revoke BEFORE INSERT ON revoked_tokens FOR EACH ROW EXECUTE FUNCTION auth_test_reject_revoke()',
    );
    const failed = await refresh(token);
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(await prisma.revokedToken.findUnique({ where: { jti: claims.jti } })).toBeNull();
    await prisma.$executeRawUnsafe('DROP TRIGGER auth_test_reject_revoke ON revoked_tokens');
    await prisma.$executeRawUnsafe('DROP FUNCTION auth_test_reject_revoke()');
    expect((await refresh(token)).status).toBe(200);
  });

  it('rolls back both the claim and audit when the transactional audit append fails', async () => {
    const { user, token, claims } = await fixture();
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION auth_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit storage failed'; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER auth_test_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION auth_test_reject_audit()',
    );
    const failed = await refresh(token);
    expect(failed.status).toBe(500);
    expect(failed.body.accessToken).toBeUndefined();
    expect(failed.body.refreshToken).toBeUndefined();
    expect(await prisma.revokedToken.findUnique({ where: { jti: claims.jti } })).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { actorId: user.id, action: 'auth.refresh' } }),
    ).toBe(0);
    await prisma.$executeRawUnsafe('DROP TRIGGER auth_test_reject_audit ON audit_logs');
    await prisma.$executeRawUnsafe('DROP FUNCTION auth_test_reject_audit()');
    expect((await refresh(token)).status).toBe(200);
  });

  it('keeps logout idempotent and rejects its revoked token', async () => {
    const { token, claims } = await fixture();
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      request(app).post('/auth/logout').send({ refreshToken: token }),
    ));
    expect(responses.map((response) => response.status)).toEqual([204, 204, 204, 204]);
    expect(await prisma.revokedToken.count({ where: { jti: claims.jti } })).toBe(1);
    expect((await refresh(token)).status).toBe(401);
  });

  it('serializes a logout/rotation race under the documented token-scoped logout policy', async () => {
    const { token } = await fixture();
    const [rotated, loggedOut] = await Promise.all([
      refresh(token),
      request(app).post('/auth/logout').send({ refreshToken: token }),
    ]);
    expect(loggedOut.status).toBe(204);
    expect([200, 401]).toContain(rotated.status);
    expect((await refresh(token)).status).toBe(401);
    if (rotated.status === 200)
      expect((await refresh(String(rotated.body.refreshToken))).status).toBe(200);
  });

  it('does not consume a token for an inactive account', async () => {
    const { user, token, claims } = await fixture();
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    expect((await refresh(token)).status).toBe(401);
    expect(await prisma.revokedToken.findUnique({ where: { jti: claims.jti } })).toBeNull();
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    expect((await refresh(token)).status).toBe(200);
  });
});
