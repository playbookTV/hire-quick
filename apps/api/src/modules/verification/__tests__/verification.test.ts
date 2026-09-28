import express, { type Request, type Response, type NextFunction } from 'express';
import type { Redis } from 'ioredis';
import { adminRouter } from '../../admin/routes.js';
import { smileWebhookRouter } from '../routes.js';
import { noopGateway } from '../../../realtime/gateway.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp, type ApiError } from '../../../app.js';
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
  vi.restoreAllMocks();
  // Only records created by this suite; audit history is never removed.
  await prisma.usherVerification.deleteMany({ where: { usherId: { in: usherIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  usherIds.length = 0;
});

describe('Authenticated active KYC sessions', () => {
  it('delivers authenticated callback photos to admin review and gates approval on their availability', async () => {
    const store = new Map<string, string>();
    const redis = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      },
    } as unknown as Redis;
    const provider = new SmileKyc(
      fixtureConfig,
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/v3/token')
              ? { token: 'token' }
              : { job_id: jobId, user_id: 'user_fixture', status: 'attention' },
          ),
        ),
    );
    const harness = express();
    harness.use(
      '/webhooks/smile-id',
      express.raw({ type: '*/*' }),
      smileWebhookRouter({ kyc: provider, redis, realtime: noopGateway }),
    );
    harness.use(express.json());
    harness.use('/api/admin', adminRouter({ kyc: provider, redis, realtime: noopGateway }));
    harness.use((err: ApiError, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err.statusCode ?? 500).json({ error: { code: err.code } });
    });
    const user = await person();
    const session = await startBiometricVerification(prisma, user.userId, provider, identity);
    const record = await current(user.usherId);
    const token = await signAccessToken(await admin(), 'ADMIN');
    const callback = JSON.stringify({
      product: 'biometric_kyc',
      status: 'attention',
      partner_params: { job_id: jobId, user_id: 'user_fixture' },
      image_links: { selfie_image: 'https://smile-results.s3.eu-west-1.amazonaws.com/selfie.jpg' },
      id_fields: {
        full_name: 'Test Person',
        id_number: identity.idNumber,
        photo_url: 'https://smile-results.s3.eu-west-1.amazonaws.com/id.jpg',
      },
    });
    expect(
      (
        await request(harness)
          .post(callbackPath(session.referenceId))
          .type('json')
          .set(signatureHeaders)
          .send(callback)
      ).status,
    ).toBe(200);
    const detail = await request(harness)
      .get(`/api/admin/verifications/${record.id}/evidence`)
      .auth(token, { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(detail.body.evidence).toMatchObject({
      fullName: 'Test Person',
      maskedId: '•••••••8901',
    });
    expect(JSON.stringify(await current(user.usherId))).not.toContain('selfie.jpg');
    expect(JSON.stringify(await current(user.usherId))).not.toContain(identity.idNumber);
    const cached = new Map(store);
    store.clear();
    expect(
      (
        await request(harness)
          .post(`/api/admin/verifications/${record.id}/approve`)
          .auth(token, { type: 'bearer' })
      ).status,
    ).toBe(409);
    for (const [key, value] of cached) store.set(key, value);
    expect(
      (
        await request(harness)
          .post(`/api/admin/verifications/${record.id}/approve`)
          .auth(token, { type: 'bearer' })
      ).status,
    ).toBe(200);
    expect((await current(user.usherId)).status).toBe('APPROVED');
  });
  it('rejects manual approval of a started capture with no evidence, while allowing rejection', async () => {
    const user = await person();
    await startBiometricVerification(prisma, user.userId, kyc, identity);
    const record = await current(user.usherId);
    const adminId = await admin();
    await expect(
      reviewVerification(prisma, { verificationId: record.id, adminId, decision: 'APPROVED' }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
    expect((await current(user.usherId)).status).toBe('PENDING');
    const token = await signAccessToken(adminId, 'ADMIN');
    const denied = await request(app)
      .post(`/api/admin/verifications/${record.id}/approve`)
      .auth(token, { type: 'bearer' })
      .send({ evidenceJobId: jobId });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('EVIDENCE_REQUIRED');
    const refresh = await request(app)
      .post(`/api/admin/verifications/${record.id}/evidence/refresh`)
      .auth(token, { type: 'bearer' });
    expect(refresh.status).toBe(409);
    expect(refresh.body.error.code).toBe('NO_PROVIDER_JOB');
    const detail = await request(app)
      .get(`/api/admin/verifications/${record.id}/evidence`)
      .auth(token, { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual({ evidence: null });
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(
      (
        await request(app)
          .get(`/api/admin/verifications/${record.id}/evidence`)
          .auth(user.token, { type: 'bearer' })
      ).status,
    ).toBe(403);
    await reviewVerification(prisma, {
      verificationId: record.id,
      adminId,
      decision: 'REJECTED',
      reason: 'Capture incomplete',
    });
    expect((await current(user.usherId)).status).toBe('REJECTED');
  });
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
    const payload = JSON.parse(
      String((fetcher.mock.calls[0]?.[1]?.body as FormData).get('payload')),
    );
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
      environment: 'sandbox',
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

  it('expires old Smile attempts at the 6-hour boundary without erasing history', async () => {
    const user = await person();
    const now = Date.now();
    await prisma.usher.update({ where: { id: user.usherId }, data: { kycAttempts: 5 } });
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 5 }, () => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'SMILE_ID',
        status: 'REJECTED' as const,
        createdAt: new Date(now - 6 * 60 * 60 * 1000),
      })),
    });
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ).resolves.toHaveProperty('token');
    // A second start must use the renewed budget, not reapply the lifetime cap.
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ).resolves.toHaveProperty('token');
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(7);
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: user.usherId } })).kycAttempts,
    ).toBe(7);
  });

  it('returns the remaining cooldown and allows a start exactly when the oldest recent attempt expires', async () => {
    const user = await person();
    const now = Date.now();
    const minute = 60 * 1000;
    await prisma.usherVerification.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        usherId: user.usherId,
        method: 'BIOMETRIC' as const,
        provider: 'SMILE_ID',
        status: 'REJECTED' as const,
        createdAt: new Date(now - 6 * 60 * minute + (index + 1) * minute),
      })),
    });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const blocked = await request(app)
      .post('/api/me/verification/kyc/start')
      .set('Authorization', `Bearer ${user.token}`)
      .send(identity);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toEqual({
      code: 'KYC_ATTEMPTS_EXCEEDED',
      message:
        "You've reached the limit of 5 verification attempts in 6 hours. Try again in 1 minute.",
    });
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(5);
    clock.mockReturnValue(now + minute - 1);
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ).rejects.toMatchObject({
      code: 'KYC_ATTEMPTS_EXCEEDED',
    });
    clock.mockReturnValue(now + minute);
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        startBiometricVerification(prisma, user.userId, kyc, identity),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(6);
  });

  it('refreshes the latest pending session even while new starts are cooling down', async () => {
    const user = await person();
    let reference = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      reference = (await startBiometricVerification(prisma, user.userId, kyc, identity))
        .referenceId;
    }
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity),
    ).rejects.toMatchObject({
      code: 'KYC_ATTEMPTS_EXCEEDED',
    });
    await expect(
      startBiometricVerification(prisma, user.userId, kyc, identity, reference),
    ).resolves.toMatchObject({
      referenceId: reference,
    });
    expect(await prisma.usherVerification.count({ where: { usherId: user.usherId } })).toBe(5);
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
