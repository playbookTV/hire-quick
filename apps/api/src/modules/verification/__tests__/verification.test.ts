import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { SmileKyc } from '../port/smile-kyc.js';
import {
  fixtureConfig,
  identity,
  jobId,
  callbackPath,
  signatureHeaders,
  providerFetch,
} from './smile-fixtures.js';
import {
  applyKycResult,
  reviewVerification,
  startBiometricVerification,
  submitDocumentVerification,
} from '../service.js';

const kyc = new SmileKyc(fixtureConfig, providerFetch);
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
  idFound: true,
  livenessPassed: true,
  faceMatchScore: 90,
};
const rejected = { decision: 'rejected' as const, reasonCode: 'SELFIE_MISMATCH' };
function payload() {
  return JSON.stringify({
    product: 'biometric_kyc',
    status: 'clear',
    partner_params: { job_id: jobId, user_id: 'user_fixture' },
    id_fields: { id_number: '12345678901' },
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
  it('refreshes an owned pending session without consuming another attempt and rejects other owners', async () => {
    const user = await person();
    const other = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc, identity);
    const renewed = await startBiometricVerification(
      prisma,
      user.userId,
      kyc,
      identity,
      session.referenceId,
    );
    expect(renewed.referenceId).toBe(session.referenceId);
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).kycAttempts,
    ).toBe(1);
    await expect(
      startBiometricVerification(prisma, other.userId, kyc, identity, session.referenceId),
    ).rejects.toMatchObject({ code: 'STALE_VERIFICATION' });
  });
  it('does not charge an attempt or change state when token creation fails', async () => {
    const user = await person();
    const unavailable = new SmileKyc(
      fixtureConfig,
      async () => new Response('{}', { status: 503 }),
    );
    await expect(
      startBiometricVerification(prisma, user.userId, unavailable, identity),
    ).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).kycAttempts,
    ).toBe(0);
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(0);
  });
  it('does not settle legacy Dojah evidence through the Smile adapter', async () => {
    const user = await person();
    const referenceId = randomUUID();
    await prisma.usherVerification.create({
      data: {
        usherId: user.usherId,
        method: 'BIOMETRIC',
        provider: 'DOJAH',
        providerReferenceId: referenceId,
      },
    });
    expect(await applyKycResult(prisma, referenceId, passed)).toBeNull();
  });
  it('requires authenticated, valid identity input before creating a session', async () => {
    const user = await person();
    expect((await request(app).post('/api/me/verification/kyc/start').send(identity)).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post('/api/me/verification/kyc/start')
          .auth(user.token, { type: 'bearer' })
          .send({ ...identity, idNumber: 'wrong' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/me/verification/kyc/start')
          .auth(user.token, { type: 'bearer' })
          .send({ ...identity, email: 'invalid-email' })
      ).status,
    ).toBe(400);
    const res = await request(app)
      .post('/api/me/verification/kyc/start')
      .auth(user.token, { type: 'bearer' })
      .send(identity);
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('passes a validated sandbox email through the HTTP route to the provider token', async () => {
    const user = await person();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(providerFetch);
    const email = 'amina.clearwater@example.com';
    const res = await request(createApp({ kyc: new SmileKyc(fixtureConfig, fetcher) }))
      .post('/api/me/verification/kyc/start')
      .auth(user.token, { type: 'bearer' })
      .send({ ...identity, givenNames: 'Amina Fatou', lastName: 'Clearwater', email });
    expect(res.status).toBe(201);
    const payload = JSON.parse(String((fetcher.mock.calls[0]?.[1]?.body as FormData).get('payload')));
    expect(payload.email).toBe(email);
    expect(JSON.stringify(res.body)).not.toContain(email);
    const saved = await current(user.usherId);
    expect(JSON.stringify(saved)).not.toContain(email);
  });
  it('rejects missing/bad signatures and accepts the correctly signed active result without storing raw IDs', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc, identity);
    const body = payload();
    expect(
      (await request(app).post(callbackPath(session.referenceId)).type('json').send(body)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(callbackPath(session.referenceId))
          .type('json')
          .set({ ...signatureHeaders, 'response-signature': 'invalid' })
          .send(body)
      ).status,
    ).toBe(401);
    expect((await current(user.usherId)).status).toBe('PENDING');
    expect(
      (
        await request(app)
          .post(callbackPath(session.referenceId))
          .type('json')
          .set(signatureHeaders)
          .send(body)
      ).status,
    ).toBe(200);
    const record = await current(user.usherId);
    expect(record).toMatchObject({ status: 'APPROVED', nin: null, bvn: null, govPhotoKey: null });
    expect(record.govLookup).toEqual({
      idFound: null,
      livenessPassed: null,
      faceMatchScore: null,
      watchListed: null,
      providerJobId: jobId,
      providerStatus: 'clear',
    });
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).verificationStatus,
    ).toBe('VERIFIED');
  });

  it('duplicates and pending/contradictory events cannot overwrite a terminal result', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc, identity);
    expect(await applyKycResult(prisma, session.referenceId, passed)).not.toBeNull();
    const settled = await current(user.usherId);
    expect(await applyKycResult(prisma, session.referenceId, passed)).toBeNull();
    expect(await applyKycResult(prisma, session.referenceId, { decision: 'pending' })).toBeNull();
    expect(await applyKycResult(prisma, session.referenceId, rejected)).toBeNull();
    expect(await current(user.usherId)).toEqual(settled);
  });

  it('old verified callbacks cannot override rejection followed by a new active session', async () => {
    const user = await person();
    const old = await startBiometricVerification(prisma, user.userId, kyc, identity);
    await applyKycResult(prisma, old.referenceId, rejected);
    const fresh = await startBiometricVerification(prisma, user.userId, kyc, identity);
    expect(await applyKycResult(prisma, old.referenceId, passed)).toBeNull();
    expect(await current(user.usherId)).toMatchObject({
      providerReferenceId: fresh.referenceId,
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
      startBiometricVerification(prisma, user.userId, kyc, identity),
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ]);
    const active = await current(user.usherId);
    const old = sessions.find((session) => session.referenceId !== active.providerReferenceId)!;
    expect(await applyKycResult(prisma, old.referenceId, passed)).toBeNull();
    expect(await applyKycResult(prisma, active.providerReferenceId!, passed)).not.toBeNull();
    const rows = await prisma.usherVerification.findMany({ where: { usherId: user.usherId } });
    expect(new Set(rows.map((row) => row.createdAt.getTime())).size).toBe(2);
  });

  it('manual submission and its explicit decision supersede an older biometric attempt', async () => {
    const user = await person();
    const old = await startBiometricVerification(prisma, user.userId, kyc, identity);
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
      where: { providerReferenceId: old.referenceId },
    });
    await expect(
      reviewVerification(prisma, { verificationId: oldRecord.id, adminId, decision: 'APPROVED' }),
    ).rejects.toMatchObject({ code: 'STALE_VERIFICATION' });
  });

  it('an explicit manual decision wins a race with a provider callback on the same active record', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc, identity);
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

  it('gives existing Dojah failures a fresh Smile attempt budget without erasing their history', async () => {
    const user = await person();
    await prisma.usher.update({ where: { id: user.usherId }, data: { kycAttempts: 5 } });
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 5 }, () => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'DOJAH',
        status: 'REJECTED' as const,
      })),
    });
    await startBiometricVerification(prisma, user.userId, kyc, identity);
    expect(
      await prisma.usherVerification.count({ where: { usherId: user.usherId, provider: 'DOJAH' } }),
    ).toBe(5);
    expect((await current(user.usherId)).provider).toBe('SMILE_ID');
  });

  it('ignores a claimed clear callback and uses the authoritative server result', async () => {
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, kyc, identity);
    const blocking = new SmileKyc(
      fixtureConfig,
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/v3/token')
              ? { token: 'test-token' }
              : { job_id: jobId, user_id: 'user_fixture', status: 'block' },
          ),
        ),
    );
    const response = await request(createApp({ kyc: blocking }))
      .post(callbackPath(session.referenceId))
      .type('json')
      .set(signatureHeaders)
      .send(payload());
    expect(response.status).toBe(200);
    expect((await current(user.usherId)).status).toBe('REJECTED');
  });

  it('the final allowed start is reserved exactly once under concurrent requests', async () => {
    const user = await person();
    await prisma.usher.update({ where: { id: user.usherId }, data: { kycAttempts: 4 } });
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 4 }, () => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'SMILE_ID',
        status: 'REJECTED' as const,
      })),
    });
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        startBiometricVerification(prisma, user.userId, kyc, identity),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).kycAttempts,
    ).toBe(5);
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(5);
  });

  it('unknown or duplicate provider reference evidence never chooses a guessed session', async () => {
    const user = await person();
    expect(await applyKycResult(prisma, randomUUID(), passed)).toBeNull();
    const reference = randomUUID();
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 2 }, () => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'SMILE_ID',
        providerReferenceId: reference,
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
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ).rejects.toMatchObject({
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
