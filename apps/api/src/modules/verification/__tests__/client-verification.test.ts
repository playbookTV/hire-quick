import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { NoopKyc } from '../port/noop-kyc.js';
import type { KycPort } from '../port/kyc-port.js';
import { startBiometricVerification, applyKycResult } from '../service.js';
import {
  chooseClientAccountType,
  submitBusinessVerification,
  reviewBusinessVerification,
} from '../business.js';
import { buildExport, eraseUser } from '../../privacy/service.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';
import { holdOrder } from '../../payments/ledger/ledger.js';

const users: string[] = [];
const scenarios: Scenario[] = [];
const identity = {
  idType: 'NIN' as const,
  idNumber: '00000000000',
  givenNames: 'Test',
  lastName: 'Client',
};
function provider(): KycPort {
  return {
    ...new NoopKyc(),
    startSession: vi.fn(async (referenceId) => ({
      referenceId,
      token: 'fixture',
      partnerId: '123',
      sandbox: true,
      privacyPolicyUrl: 'https://example.com/privacy',
    })),
    getResult: vi.fn(),
    verifyWebhook: () => null,
    verifyBusiness: vi.fn(async () => ({
      status: 'VERIFIED' as const,
      registeredName: 'Fixture Company Limited',
      providerJobId: 'fixture-job',
      environment: 'sandbox' as const,
    })),
  };
}
async function person(verified = false) {
  const user = await prisma.user.create({
    data: {
      role: 'CLIENT',
      status: 'ACTIVE',
      phone: `client-verification-${randomUUID()}`,
      client: {
        create: {
          displayName: 'Fixture client',
          verificationStatus: verified ? 'VERIFIED' : 'PENDING',
        },
      },
    },
    include: { client: true },
  });
  users.push(user.id);
  return { ...user, client: user.client!, token: await signAccessToken(user.id, 'CLIENT') };
}
async function admin() {
  const user = await prisma.user.create({
    data: { role: 'ADMIN', status: 'ACTIVE', email: `${randomUUID()}@example.com` },
  });
  users.push(user.id);
  return user.id;
}
async function businessInput(user: Awaited<ReturnType<typeof person>>) {
  const key = `verifications/${user.client.id}/business-${randomUUID()}.jpg`;
  await prisma.uploadIntent.create({
    data: {
      key,
      stagingKey: `staging/${key}`,
      ownerId: user.id,
      scopeId: user.client.id,
      purpose: 'business-authorization',
      contentType: 'image/jpeg',
      byteSize: 10,
      expiresAt: new Date(Date.now() + 300_000),
      attachExpiresAt: new Date(Date.now() + 86_400_000),
      finalizedAt: new Date(),
    },
  });
  return {
    registeredName: 'Fixture Company Limited',
    registrationNumber: '1234567',
    businessType: 'co' as const,
    representativeRole: 'Director',
    authorizationKey: key,
    authorized: true as const,
  };
}
afterEach(async () => {
  for (const scenario of scenarios.splice(0)) await teardown(scenario);
  await prisma.uploadIntent.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

it('requires identity and account type, while keeping profile, privacy and verification accessible', async () => {
  const user = await person();
  const app = createApp({ kyc: provider() });
  for (const path of ['/api/ushers', '/api/events'])
    expect((await request(app).get(path).auth(user.token, { type: 'bearer' })).status).toBe(403);
  expect((await request(app).get('/api/me').auth(user.token, { type: 'bearer' })).status).toBe(200);
  expect(
    (await request(app).get('/api/me/verification').auth(user.token, { type: 'bearer' })).body,
  ).toEqual([]);
  await chooseClientAccountType(user.id, 'INDIVIDUAL');
  const start = await startBiometricVerification(prisma, user.id, provider(), identity);
  expect((await request(app).get('/api/ushers').auth(user.token, { type: 'bearer' })).status).toBe(
    403,
  );
  await applyKycResult(prisma, start.referenceId, { decision: 'verified' });
  expect((await request(app).get('/api/ushers').auth(user.token, { type: 'bearer' })).status).toBe(
    200,
  );
  await request(app)
    .patch('/api/me')
    .auth(user.token, { type: 'bearer' })
    .send({ verificationStatus: 'VERIFIED', businessVerificationStatus: 'VERIFIED' });
  expect(
    (await prisma.client.findUniqueOrThrow({ where: { id: user.client.id } }))
      .businessVerificationStatus,
  ).toBe('NOT_STARTED');
});

it('keeps client attempts isolated and ignores stale and duplicate results', async () => {
  const first = await person();
  const second = await person();
  const kyc = provider();
  const old = await startBiometricVerification(prisma, first.id, kyc, identity);
  const current = await startBiometricVerification(prisma, first.id, kyc, identity);
  expect(await applyKycResult(prisma, old.referenceId, { decision: 'verified' })).toBeNull();
  await applyKycResult(prisma, current.referenceId, { decision: 'rejected' });
  expect(await applyKycResult(prisma, current.referenceId, { decision: 'verified' })).toBeNull();
  expect(
    (await prisma.client.findUniqueOrThrow({ where: { id: first.client.id } })).verificationStatus,
  ).toBe('REJECTED');
  expect(
    (await prisma.client.findUniqueOrThrow({ where: { id: second.client.id } })).verificationStatus,
  ).toBe('PENDING');
  await expect(
    startBiometricVerification(prisma, second.id, kyc, identity, current.referenceId),
  ).rejects.toMatchObject({ code: 'STALE_VERIFICATION' });
});

it('serializes client identity attempts under the rolling attempt limit', async () => {
  const user = await person();
  const kyc = provider();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 6 }, () => startBiometricVerification(prisma, user.id, kyc, identity)),
  );
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(5);
  expect(await prisma.usherVerification.count({ where: { clientId: user.client.id } })).toBe(5);
});

it('requires registry evidence and explicit authority review before granting business access', async () => {
  const user = await person(true);
  const adminId = await admin();
  const kyc = provider();
  const app = createApp({ kyc });
  await chooseClientAccountType(user.id, 'BUSINESS');
  const input = await businessInput(user);
  const records = await Promise.all([
    submitBusinessVerification(user.id, input, kyc),
    submitBusinessVerification(user.id, input, kyc),
  ]);
  expect(records[0]!.id).toBe(records[1]!.id);
  expect(kyc.verifyBusiness).toHaveBeenCalledTimes(1);
  expect((await request(app).get('/api/ushers').auth(user.token, { type: 'bearer' })).status).toBe(
    403,
  );
  const review = {
    id: records[0]!.id,
    adminId,
    decision: 'APPROVED' as const,
    note: 'Authority checked against the verified representative.',
    authorityConfirmed: false,
  };
  await expect(reviewBusinessVerification(review)).rejects.toMatchObject({
    code: 'BUSINESS_EVIDENCE_REQUIRED',
  });
  const adminToken = await signAccessToken(adminId, 'ADMIN');
  expect(
    (
      await request(app)
        .get('/api/admin/business-verifications')
        .auth(user.token, { type: 'bearer' })
    ).status,
  ).toBe(403);
  const queue = await request(app)
    .get('/api/admin/business-verifications')
    .auth(adminToken, { type: 'bearer' });
  expect(queue.status).toBe(200);
  expect(queue.headers['cache-control']).toBe('no-store');
  expect(queue.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: review.id, registryStatus: 'VERIFIED' }),
    ]),
  );
  expect(
    (await request(app).get('/api/admin/stats').auth(adminToken, { type: 'bearer' })).body
      .pendingVerifications,
  ).toBeGreaterThanOrEqual(1);
  const decision = await request(app)
    .post(`/api/admin/business-verifications/${review.id}/review`)
    .auth(adminToken, { type: 'bearer' })
    .send({ decision: review.decision, note: review.note, authorityConfirmed: true });
  expect(decision.status).toBe(200);
  expect((await request(app).get('/api/ushers').auth(user.token, { type: 'bearer' })).status).toBe(
    200,
  );
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.client.id } });
  expect(client.businessName).toBe('Fixture Company Limited');
  expect(client.businessVerificationStatus).toBe('VERIFIED');
  expect(
    (
      await request(app)
        .patch('/api/me')
        .auth(user.token, { type: 'bearer' })
        .send({ businessName: 'Someone else' })
    ).status,
  ).toBe(409);
  await expect(chooseClientAccountType(user.id, 'INDIVIDUAL')).rejects.toMatchObject({
    code: 'ACCOUNT_TYPE_LOCKED',
  });
});

it('does not grant a business badge after an unavailable lookup or allow another account’s upload', async () => {
  const user = await person(true);
  const other = await person(true);
  const adminId = await admin();
  const kyc = provider();
  await chooseClientAccountType(user.id, 'BUSINESS');
  await expect(
    submitBusinessVerification(user.id, await businessInput(other), kyc),
  ).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
  kyc.verifyBusiness = vi.fn(async () => ({
    status: 'UNAVAILABLE' as const,
    registeredName: null,
    providerJobId: null,
    environment: 'sandbox' as const,
  }));
  const record = await submitBusinessVerification(user.id, await businessInput(user), kyc);
  expect(record.registryStatus).toBe('UNAVAILABLE');
  await expect(
    reviewBusinessVerification({
      id: record.id,
      adminId,
      decision: 'APPROVED',
      note: 'Should not be approved.',
      authorityConfirmed: true,
    }),
  ).rejects.toMatchObject({ code: 'BUSINESS_EVIDENCE_REQUIRED' });
  await reviewBusinessVerification({
    id: record.id,
    adminId,
    decision: 'REJECTED',
    note: 'Please confirm the registration details.',
    authorityConfirmed: false,
  });
  expect(
    (await prisma.client.findUniqueOrThrow({ where: { id: user.client.id } }))
      .businessVerificationStatus,
  ).toBe('REJECTED');
});

it('exports and erases client verification evidence without reviving trust', async () => {
  const user = await person(true);
  const kyc = provider();
  await chooseClientAccountType(user.id, 'BUSINESS');
  const input = await businessInput(user);
  const record = await submitBusinessVerification(user.id, input, kyc);
  expect((await buildExport(user.id)).client).toMatchObject({
    businessVerifications: [{ id: record.id }],
  });
  await prisma.$transaction((tx) => eraseUser(tx, user.id));
  expect(
    await prisma.businessVerification.findUniqueOrThrow({ where: { id: record.id } }),
  ).toMatchObject({ authorizationKey: null, registeredName: '[redacted]', registryName: null });
  expect(
    (await prisma.client.findUniqueOrThrow({ where: { id: user.client.id } })).verificationStatus,
  ).toBe('PENDING');
  expect(
    await prisma.storageDeletion.findUnique({ where: { key: input.authorizationKey } }),
  ).not.toBeNull();
});

it('preserves paid booking access for existing unverified clients and blocks new hiring', async () => {
  const scenario = await createScenario({ headcount: 1 });
  scenarios.push(scenario);
  await prisma.$transaction((tx) => holdOrder(tx, scenario.orderId, 'verification-fixture'));
  await prisma.client.update({
    where: { id: scenario.clientId },
    data: { accountType: null, verificationStatus: 'PENDING' },
  });
  const token = await signAccessToken(scenario.clientUserId, 'CLIENT');
  const app = createApp({ kyc: provider() });
  expect(
    (
      await request(app)
        .get(`/api/bookings/${scenario.bookingIds[0]}`)
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(200);
  expect(
    (await request(app).get('/api/bookings').auth(token, { type: 'bearer' })).body,
  ).toHaveLength(1);
  expect(
    (await request(app).post('/api/events').auth(token, { type: 'bearer' }).send({})).status,
  ).toBe(403);
});
