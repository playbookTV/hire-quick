import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './fake-database';

vi.mock('../../../apps/api/src/env.js', () => ({ env: {
  JWT_ACCESS_SECRET: 'audit-only-access-key-never-used-by-any-deployment',
  JWT_REFRESH_SECRET: 'audit-only-refresh-key-never-used-by-any-deployment',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 3600,
} }));
vi.mock('../../../apps/api/src/app.js', () => ({ ApiError: class extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
} }));

import { requireAuth, requireRole } from '../../../apps/api/src/modules/auth/middleware';
import { signAccessToken, signRefreshToken, revokeRefreshToken } from '../../../apps/api/src/modules/auth/tokens';
import { authorizeSocketToken } from '../../../apps/api/src/realtime/socket-auth';

async function requestAdmin(access?: string): Promise<{ status: number; role?: string; code?: string }> {
  const req = { header: () => access === undefined ? undefined : `Bearer ${access}` } as unknown as Parameters<typeof requireAuth>[0];
  const res = {} as Parameters<typeof requireAuth>[1];
  return new Promise((resolve) => {
    requireAuth(req, res, (error) => {
      if (error) return resolve({ status: error.statusCode, code: error.code });
      requireRole('ADMIN')(req, res, (roleError) => {
        if (roleError) return resolve({ status: roleError.statusCode, code: roleError.code });
        resolve({ status: 200, role: (req as unknown as { auth: { role: string } }).auth.role });
      });
    });
  });
}

async function session(role: 'ADMIN' | 'CLIENT' = 'ADMIN') {
  const refresh = await signRefreshToken(state.user.id);
  return { refresh, access: await signAccessToken(state.user.id, role, refresh) };
}

beforeEach(() => { state.user.role = 'ADMIN'; state.user.status = 'ACTIVE'; state.missing = false; state.revoked.clear(); });

describe('real JWT and HTTP/socket authorization with isolated persistence', () => {
  it('allows the current administrator and denies anonymous, malformed and lower-role tokens', async () => {
    expect(await requestAdmin((await session()).access)).toEqual({ status: 200, role: 'ADMIN' });
    expect((await requestAdmin()).status).toBe(401);
    expect((await requestAdmin('not-a-token')).status).toBe(401);
    state.user.role = 'CLIENT';
    expect((await requestAdmin((await session('CLIENT')).access)).status).toBe(403);
  });

  it('rejects stale administrator authority after a live role downgrade on HTTP and sockets', async () => {
    const { access } = await session();
    expect((await requestAdmin(access)).status).toBe(200);
    await expect(authorizeSocketToken(access)).resolves.toMatchObject({ role: 'ADMIN' });
    state.user.role = 'CLIENT';
    expect(await requestAdmin(access)).toEqual({ status: 401, code: 'ROLE_CHANGED' });
    await expect(authorizeSocketToken(access)).rejects.toThrow('socket session unavailable');
  });

  it.each(['SUSPENDED', 'ANONYMIZED'])('denies existing access after live status becomes %s', async (status) => {
    const { access } = await session();
    state.user.status = status;
    expect(await requestAdmin(access)).toEqual({ status: 403, code: 'ACCOUNT_INACTIVE' });
    await expect(authorizeSocketToken(access)).rejects.toThrow();
  });

  it('denies access when the account no longer exists', async () => {
    const { access } = await session();
    state.missing = true;
    expect((await requestAdmin(access)).status).toBe(403);
    await expect(authorizeSocketToken(access)).rejects.toThrow();
  });

  it('documents logout semantics: revoked refresh binding denies sockets while existing REST access survives', async () => {
    const { access, refresh } = await session();
    await revokeRefreshToken(refresh);
    expect((await requestAdmin(access)).status).toBe(200);
    await expect(authorizeSocketToken(access)).rejects.toThrow('socket session unavailable');
  });
});
