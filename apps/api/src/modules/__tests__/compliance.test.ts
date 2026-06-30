/**
 * Compliance controls (NDPR / TRD §14): tamper-evident audit chain, DSAR
 * pseudonymizing erase, and the retention purge. DB-backed, serial.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@hq/database';
import { writeAudit, verifyAuditChain } from '../audit.js';
import { eraseUser } from '../privacy/service.js';
import { jobRetentionPurge } from '../jobs/jobs.js';

const tag = `cmpl-${Date.now()}`;
const digits = tag.replace(/\D/g, '').slice(-9);

const created = { userIds: [] as string[], codeIds: [] as string[], tokenIds: [] as string[] };

afterAll(async () => {
  await prisma.deviceToken.deleteMany({ where: { id: { in: created.tokenIds } } });
  await prisma.verificationCode.deleteMany({ where: { id: { in: created.codeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
});

describe('compliance (NDPR §14)', () => {
  it('audit chain verifies, detects tampering, and recovers', async () => {
    await writeAudit({ actorId: null, action: `${tag}.a`, target: 't1' });
    await writeAudit({ actorId: null, action: `${tag}.b`, target: 't2', metadata: { n: 1 } });

    expect((await verifyAuditChain()).ok).toBe(true);

    // Tamper the most recent chained row → chain must break detectably.
    const row = await prisma.auditLog.findFirst({
      where: { entryHash: { not: null } },
      orderBy: { seq: 'desc' },
    });
    expect(row).toBeTruthy();
    const original = row!.action;

    await prisma.auditLog.update({ where: { id: row!.id }, data: { action: `${original}-TAMPERED` } });
    const broken = await verifyAuditChain();
    expect(broken.ok).toBe(false);
    expect(broken.brokenAt?.reason).toContain('entryHash');

    // Restore so the global chain is valid for any later suite.
    await prisma.auditLog.update({ where: { id: row!.id }, data: { action: original } });
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it('erase pseudonymizes PII and flags the account ANONYMIZED', async () => {
    const user = await prisma.user.create({
      data: { role: 'CLIENT', phone: `+99${digits}`, email: `${tag}@ex.com` },
    });
    created.userIds.push(user.id);
    const token = await prisma.deviceToken.create({
      data: { userId: user.id, fcmToken: `tok-${tag}`, platform: 'ANDROID' },
    });
    created.tokenIds.push(token.id);

    await prisma.$transaction((tx) => eraseUser(tx, user.id));

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.status).toBe('ANONYMIZED');
    expect(after?.email).toBeNull();
    expect(after?.phone.startsWith('deleted:')).toBe(true);
    expect(after?.anonymizedAt).toBeTruthy();
    expect(await prisma.deviceToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('retention purge removes aged transient PII but keeps fresh rows', async () => {
    const user = await prisma.user.create({ data: { role: 'USHER', phone: `+98${digits}` } });
    created.userIds.push(user.id);

    const oldMs = 45 * 86_400_000;
    const agedCode = await prisma.verificationCode.create({
      data: {
        purpose: 'AUTH',
        subjectRef: `aged-${tag}`,
        codeHash: 'x',
        expiresAt: new Date(Date.now() - oldMs),
        consumedAt: new Date(Date.now() - oldMs),
        createdAt: new Date(Date.now() - oldMs),
      },
    });
    const freshCode = await prisma.verificationCode.create({
      data: { purpose: 'AUTH', subjectRef: `fresh-${tag}`, codeHash: 'x', expiresAt: new Date(Date.now() + 600_000) },
    });
    created.codeIds.push(freshCode.id); // aged one is expected to be purged

    const agedTok = await prisma.deviceToken.create({
      data: {
        userId: user.id,
        fcmToken: `aged-tok-${tag}`,
        platform: 'IOS',
        lastSeenAt: new Date(Date.now() - 200 * 86_400_000),
      },
    });
    const freshTok = await prisma.deviceToken.create({
      data: { userId: user.id, fcmToken: `fresh-tok-${tag}`, platform: 'IOS' },
    });
    created.tokenIds.push(freshTok.id);

    await jobRetentionPurge();

    expect(await prisma.verificationCode.findUnique({ where: { id: agedCode.id } })).toBeNull();
    expect(await prisma.verificationCode.findUnique({ where: { id: freshCode.id } })).toBeTruthy();
    expect(await prisma.deviceToken.findUnique({ where: { id: agedTok.id } })).toBeNull();
    expect(await prisma.deviceToken.findUnique({ where: { id: freshTok.id } })).toBeTruthy();
  });
});
