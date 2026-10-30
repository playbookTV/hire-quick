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
  it('audit chain verifies after successive appends', async () => {
    await writeAudit({ actorId: null, action: `${tag}.a`, target: 't1' });
    await writeAudit({ actorId: null, action: `${tag}.b`, target: 't2', metadata: { n: 1 } });

    expect((await verifyAuditChain()).ok).toBe(true);

    // Mutation rejection and privileged tamper detection are covered by the
    // audit suites. Never commit damaged history to the shared test chain.
  });

  it('erase pseudonymizes PII and flags the account ANONYMIZED', async () => {
    const user = await prisma.user.create({
      data: { role: 'CLIENT', phone: `+99${digits}`, email: `${tag}@ex.com` },
    });
    created.userIds.push(user.id);
    const token = await prisma.deviceToken.create({
      data: { userId: user.id, token: `tok-${tag}`, platform: 'ANDROID' },
    });
    created.tokenIds.push(token.id);
    await prisma.notificationPreference.create({ data: { userId: user.id, messages: false } });
    await prisma.notificationDispatch.create({
      data: { userId: user.id, kind: 'BOOKING_CONFIRMED', targetType: 'booking', targetId: tag },
    });

    await prisma.$transaction((tx) => eraseUser(tx, user.id));

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.status).toBe('ANONYMIZED');
    expect(after?.email).toBeNull();
    expect(after?.phone).toMatch(/^deleted:/);
    expect(after?.anonymizedAt).toBeTruthy();
    expect(await prisma.deviceToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.notificationPreference.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.notificationDispatch.count({ where: { userId: user.id } })).toBe(0);
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
        token: `aged-tok-${tag}`,
        platform: 'IOS',
        lastSeenAt: new Date(Date.now() - 200 * 86_400_000),
      },
    });
    const freshTok = await prisma.deviceToken.create({
      data: { userId: user.id, token: `fresh-tok-${tag}`, platform: 'IOS' },
    });
    created.tokenIds.push(freshTok.id);
    const agedDispatch = await prisma.notificationDispatch.create({
      data: { userId: user.id, kind: 'NEW_MESSAGE', sentAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    const freshDispatch = await prisma.notificationDispatch.create({
      data: { userId: user.id, kind: 'NEW_MESSAGE' },
    });

    await jobRetentionPurge();

    expect(await prisma.verificationCode.findUnique({ where: { id: agedCode.id } })).toBeNull();
    expect(await prisma.verificationCode.findUnique({ where: { id: freshCode.id } })).toBeTruthy();
    expect(await prisma.deviceToken.findUnique({ where: { id: agedTok.id } })).toBeNull();
    expect(await prisma.deviceToken.findUnique({ where: { id: freshTok.id } })).toBeTruthy();
    expect(await prisma.notificationDispatch.findUnique({ where: { id: agedDispatch.id } })).toBeNull();
    expect(await prisma.notificationDispatch.findUnique({ where: { id: freshDispatch.id } })).toBeTruthy();
  });
});
