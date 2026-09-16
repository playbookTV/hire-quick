import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { DojahKyc } from '../port/dojah-kyc.js';
import {
  applyKycResult,
  reviewVerification,
  startBiometricVerification,
  submitDocumentVerification,
} from '../service.js';

const secretKey = 'dojah-regression-secret';
const kyc = new DojahKyc({ appId: 'fixture-app', widgetId: 'fixture-widget', secretKey });
const app = createApp({ kyc });
const userIds: string[] = [];
const usherIds: string[] = [];

async function person() {
  const user = await prisma.user.create({
    data: {
      phone: `+234-kyc-${randomUUID()}`,
      role: 'USHER',
      status: 'ACTIVE',
      usher: { create: { verificationStatus: 'PENDING' } },
    },
    include: { usher: true },
  });
  userIds.push(user.id);
  usherIds.push(user.usher!.id);
  return {
    userId: user.id,
    usherId: user.usher!.id,
    token: await signAccessToken(user.id, 'USHER'),
  };
}
async function admin() {
  const user = await prisma.user.create({
    data: { phone: `+234-admin-${randomUUID()}`, role: 'ADMIN', status: 'ACTIVE' },
  });
  userIds.push(user.id);
  return user.id;
}
async function current(usherId: string) {
  return prisma.usherVerification.findFirstOrThrow({
    where: { usherId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}
const passed = {
  decision: 'verified' as const,
  nin: '12345678901',
  livenessPassed: true,
  faceMatchScore: 90,
};
const rejected = { decision: 'rejected' as const, reasonCode: 'SELFIE_MISMATCH' };
function payload(reference: string) {
  return JSON.stringify({
    reference_id: reference,
    verification_status: 'Completed',
    status: true,
    data: {
      government_data: { status: true, data: { nin: { entity: { nin: '12345678901' } } } },
      selfie: { status: true, data: { match_score: 90 } },
    },
  });
}

afterEach(async () => {
  // Only records created by this suite; audit history is never removed.
  await prisma.usherVerification.deleteMany({ where: { usherId: { in: usherIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  usherIds.length = 0;
});

describe('Authenticated active KYC sessions', () => {
  it('rejects missing/bad signatures and accepts the correctly signed active result without storing raw IDs', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc);
    const body = payload(session.referenceId);
    expect((await request(app).post('/webhooks/dojah').type('json').send(body)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/webhooks/dojah')
          .type('json')
          .set('x-dojah-signature', '0'.repeat(64))
          .send(body)
      ).status,
    ).toBe(401);
    expect((await current(user.usherId)).status).toBe('PENDING');
    const signature = createHmac('sha256', secretKey).update(body).digest('hex');
    expect(
      (
        await request(app)
          .post('/webhooks/dojah')
          .type('json')
          .set('x-dojah-signature', signature)
          .send(body)
      ).status,
    ).toBe(200);
    const record = await current(user.usherId);
    expect(record).toMatchObject({ status: 'APPROVED', nin: null, bvn: null, govPhotoKey: null });
    expect(record.govLookup).toEqual({
      idFound: true,
      livenessPassed: true,
      faceMatchScore: 90,
      watchListed: false,
    });
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verificationStatus,
    ).toBe('VERIFIED');
  });

  it('duplicates and pending/contradictory events cannot overwrite a terminal result', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc);
    expect(await applyKycResult(prisma, session.referenceId, passed)).not.toBeNull();
    const settled = await current(user.usherId);
    expect(await applyKycResult(prisma, session.referenceId, passed)).toBeNull();
    expect(await applyKycResult(prisma, session.referenceId, { decision: 'pending' })).toBeNull();
    expect(await applyKycResult(prisma, session.referenceId, rejected)).toBeNull();
    expect(await current(user.usherId)).toEqual(settled);
  });

  it('old verified callbacks cannot override rejection followed by a new active session', async () => {
    const user = await person();
    const old = await startBiometricVerification(prisma, user.userId, kyc);
    await applyKycResult(prisma, old.referenceId, rejected);
    const fresh = await startBiometricVerification(prisma, user.userId, kyc);
    expect(await applyKycResult(prisma, old.referenceId, passed)).toBeNull();
    expect(await current(user.usherId)).toMatchObject({
      dojahReferenceId: fresh.referenceId,
      status: 'PENDING',
    });
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verificationStatus,
    ).toBe('PENDING');
    await applyKycResult(prisma, fresh.referenceId, passed);
    expect((await current(user.usherId)).status).toBe('APPROVED');
  });

  it('only the latest of concurrent sessions can settle identity', async () => {
    const user = await person();
    const sessions = await Promise.all([
      startBiometricVerification(prisma, user.userId, kyc),
      startBiometricVerification(prisma, user.userId, kyc),
    ]);
    const active = await current(user.usherId);
    const old = sessions.find((session) => session.referenceId !== active.dojahReferenceId)!;
    expect(await applyKycResult(prisma, old.referenceId, passed)).toBeNull();
    expect(await applyKycResult(prisma, active.dojahReferenceId!, passed)).not.toBeNull();
    const rows = await prisma.usherVerification.findMany({ where: { usherId: user.usherId } });
    expect(new Set(rows.map((row) => row.createdAt.getTime())).size).toBe(2);
  });

  it('manual submission and its explicit decision supersede an older biometric attempt', async () => {
    const user = await person();
    const old = await startBiometricVerification(prisma, user.userId, kyc);
    const manual = await submitDocumentVerification(prisma, user.usherId, {
      idDocumentUrl: 'fixture/id',
      selfieUrl: 'fixture/selfie',
    });
    const adminId = await admin();
    await reviewVerification(prisma, {
      verificationId: manual.id,
      adminId,
      decision: 'REJECTED',
      reason: 'Identity mismatch',
    });
    expect(await applyKycResult(prisma, old.referenceId, passed)).toBeNull();
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verificationStatus,
    ).toBe('REJECTED');
    const oldRecord = await prisma.usherVerification.findFirstOrThrow({
      where: { dojahReferenceId: old.referenceId },
    });
    await expect(
      reviewVerification(prisma, { verificationId: oldRecord.id, adminId, decision: 'APPROVED' }),
    ).rejects.toMatchObject({ code: 'STALE_VERIFICATION' });
  });

  it('an explicit manual decision wins a race with a provider callback on the same active record', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc);
    const record = await current(user.usherId);
    const adminId = await admin();
    await Promise.all([
      applyKycResult(prisma, session.referenceId, passed),
      reviewVerification(prisma, {
        verificationId: record.id,
        adminId,
        decision: 'REJECTED',
        reason: 'Manual review failed',
      }),
    ]);
    expect(await current(user.usherId)).toMatchObject({
      status: 'REJECTED',
      reviewedById: adminId,
    });
    expect(await applyKycResult(prisma, session.referenceId, passed)).toBeNull();
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verifiedAt,
    ).toBeNull();
  });

  it('repeated matching manual decisions are no-ops and conflicting decisions require a new review flow', async () => {
    const user = await person();
    const record = await submitDocumentVerification(prisma, user.usherId, {
      idDocumentUrl: 'fixture/id',
      selfieUrl: 'fixture/selfie',
    });
    const adminId = await admin();
    const input = { verificationId: record.id, adminId, decision: 'APPROVED' as const };
    expect(await reviewVerification(prisma, input)).toEqual({ changed: true });
    expect(await reviewVerification(prisma, input)).toEqual({ changed: false });
    await expect(
      reviewVerification(prisma, { ...input, decision: 'REJECTED' }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_ALREADY_REVIEWED' });
  });

  it('the final allowed start is reserved exactly once under concurrent requests', async () => {
    const user = await person();
    await prisma.usher.update({ where: { id: user.usherId }, data: { kycAttempts: 4 } });
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => startBiometricVerification(prisma, user.userId, kyc)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).kycAttempts,
    ).toBe(5);
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(1);
  });

  it('unknown or duplicate provider reference evidence never chooses a guessed session', async () => {
    const user = await person();
    expect(await applyKycResult(prisma, randomUUID(), passed)).toBeNull();
    const reference = randomUUID();
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 2 }, () => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'DOJAH',
        dojahReferenceId: reference,
      })),
    });
    expect(await applyKycResult(prisma, reference, passed)).toBeNull();
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verificationStatus,
    ).toBe('PENDING');
  });

  it('verified identities cannot replace their final result through self-service submission', async () => {
    const user = await person();
    await prisma.usher.update({
      where: { id: user.usherId },
      data: { verificationStatus: 'VERIFIED' },
    });
    await expect(startBiometricVerification(prisma, user.userId, kyc)).rejects.toMatchObject({
      code: 'ALREADY_VERIFIED',
    });
    await expect(
      submitDocumentVerification(prisma, user.usherId, {
        idDocumentUrl: 'fixture/id',
        selfieUrl: 'fixture/selfie',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_VERIFIED' });
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(0);
  });
});
