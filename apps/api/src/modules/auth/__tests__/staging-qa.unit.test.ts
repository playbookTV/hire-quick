import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@hq/database';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), query: vi.fn(), user: vi.fn(), createUser: vi.fn(),
  count: vi.fn(), invalidate: vi.fn(), create: vi.fn(), find: vi.fn(), update: vi.fn(),
  sms: vi.fn(), whatsapp: vi.fn(), access: vi.fn(), refresh: vi.fn(), audit: vi.fn(),
  env: {
    NODE_ENV: 'staging', PAYSTACK_SECRET_KEY: 'sk_test_fixture', STAGING_QA_OTP_CODE: '012345',
    OTP_VERIFIER_SECRET: 'fixture-secret-with-more-than-thirty-two-characters', OTP_VERIFIER_KEY_ID: 'v1',
    OTP_VERIFIER_PREVIOUS_SECRET: '', OTP_VERIFIER_PREVIOUS_KEY_ID: '',
  },
}));
vi.mock('@hq/database', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../../../env.js', () => ({ env: mocks.env }));
vi.mock('../../../app.js', () => ({ ApiError: class extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
} }));
vi.mock('../../notifications/brevo.js', () => ({ sendSms: mocks.sms }));
vi.mock('../../notifications/twilio.js', () => ({ whatsappConfigured: () => false, sendWhatsAppOtp: mocks.whatsapp }));
vi.mock('../tokens.js', () => ({ signAccessToken: mocks.access, signRefreshToken: mocks.refresh }));
vi.mock('../../audit.js', () => ({ writeAudit: mocks.audit }));
import { requestOtp, verifyOtp } from '../otp.js';
import { stagingQaCode, qaSubject } from '../staging-qa.js';
import { hashOtp, verifyOtpHash } from '../hash.js';

const phone = '+2348100000001';
const identity = { id: 'client-fixture', phone, email: 'client.test@hirequick.dev', role: 'CLIENT', status: 'ACTIVE' };
const tx = {
  $queryRaw: mocks.query,
  user: { findUnique: mocks.user, create: mocks.createUser },
  verificationCode: { count: mocks.count, updateMany: mocks.invalidate, create: mocks.create,
    findFirst: mocks.find, update: mocks.update },
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.env, { NODE_ENV: 'staging', PAYSTACK_SECRET_KEY: 'sk_test_fixture', STAGING_QA_OTP_CODE: '012345' });
  mocks.transaction.mockImplementation((fn: (client: Prisma.TransactionClient) => unknown) => fn(tx));
  mocks.user.mockResolvedValue(identity);
  mocks.count.mockResolvedValue(0);
  mocks.find.mockResolvedValue(null);
  mocks.sms.mockResolvedValue(true);
  mocks.access.mockResolvedValue('access-fixture');
  mocks.refresh.mockResolvedValue('refresh-fixture');
  mocks.update.mockResolvedValue({ attempts: 1 });
});

describe('seeded staging QA identity boundary', () => {
  it.each([
    [phone, 'client.test@hirequick.dev', 'CLIENT'],
    ['+2348100000011', 'usher.a@hirequick.dev', 'USHER'],
    ['+2348100000012', 'usher.b@hirequick.dev', 'USHER'],
    ['+2348100000013', 'usher.c@hirequick.dev', 'USHER'],
  ])('allows the exact active fixture %s', async (number, email, role) => {
    mocks.user.mockResolvedValue({ ...identity, phone: number, email, role });
    expect(await stagingQaCode(tx, number)).toBe('012345');
  });
  it.each([
    null, { ...identity, email: 'other@example.test' }, { ...identity, role: 'ADMIN' },
    { ...identity, role: 'USHER' }, { ...identity, status: 'SUSPENDED' },
    { ...identity, status: 'ANONYMIZED' }, { ...identity, status: 'PENDING' },
  ])('rejects missing or changed identities (%j)', async (user) => {
    mocks.user.mockResolvedValue(user);
    expect(await stagingQaCode(tx, phone)).toBeNull();
  });
  it.each([
    { NODE_ENV: 'production' }, { NODE_ENV: 'development' }, { NODE_ENV: 'test' },
    { PAYSTACK_SECRET_KEY: 'sk_live_fixture' }, { STAGING_QA_OTP_CODE: '' },
  ])('fails closed at runtime (%j)', async (config) => {
    Object.assign(mocks.env, config);
    expect(await stagingQaCode(tx, phone)).toBeNull();
  });
  it('does not look up arbitrary phone numbers', async () => {
    expect(await stagingQaCode(tx, '+2348000000002')).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});

describe('QA uses the normal OTP lifecycle', () => {
  const validRecord = () => {
    const binding = { id: 'otp-fixture', purpose: 'AUTH' as const, subjectRef: qaSubject(phone) };
    return { ...binding, codeHash: hashOtp('012345', binding), attempts: 0 };
  };
  it('issues a bound hash without delivery and counts both OTP namespaces', async () => {
    expect(await requestOtp(phone)).toEqual({ sent: true, devCode: '012345' });
    const data = mocks.create.mock.calls[0]?.[0].data as Prisma.VerificationCodeUncheckedCreateInput;
    expect(data.subjectRef).toBe(qaSubject(phone));
    expect(verifyOtpHash(data.codeHash, '012345', { purpose: 'AUTH', subjectRef: data.subjectRef, id: data.id! })).toBe(true);
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subjectRef: { in: [phone, qaSubject(phone)] } }) }));
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(mocks.whatsapp).not.toHaveBeenCalled();
  });
  it('enforces issuance limits before issuing a QA code', async () => {
    mocks.count.mockResolvedValue(5);
    await expect(requestOtp(phone)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([phone, '+2348000000002'])('delivers normally without echo when ineligible (%s)', async (number) => {
    mocks.user.mockResolvedValue({ ...identity, role: 'ADMIN' });
    expect(await requestOtp(number)).toEqual({ sent: true });
    expect(mocks.sms).toHaveBeenCalledOnce();
  });
  it('consumes the code, preserves seeded role, signs a session and audits login', async () => {
    mocks.find.mockResolvedValue(validRecord());
    const result = await verifyOtp(phone, '012345', 'USHER');
    expect(result.user.role).toBe('CLIENT');
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'otp-fixture' }, data: { consumedAt: expect.any(Date) } });
    expect(mocks.access).toHaveBeenCalledWith(identity.id, 'CLIENT', 'refresh-fixture');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login' }), tx);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      subjectRef: qaSubject(phone), consumedAt: null, expiresAt: { gt: expect.any(Date) },
      createdAt: { gt: expect.any(Date) },
    }) }));
  });
  it('rejects absent, consumed or expired codes', async () => {
    await expect(verifyOtp(phone, '012345')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('does not search QA records after disabling QA mode', async () => {
    mocks.env.STAGING_QA_OTP_CODE = '';
    await expect(verifyOtp(phone, '012345')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subjectRef: phone }) }));
  });
  it('invalidates the previously issued code when the shared code rotates', async () => {
    mocks.find.mockResolvedValue(validRecord());
    mocks.env.STAGING_QA_OTP_CODE = '654321';
    await expect(verifyOtp(phone, '012345')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('counts incorrect guesses', async () => {
    mocks.find.mockResolvedValue(validRecord());
    await expect(verifyOtp(phone, '000000')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'otp-fixture' }, data: { attempts: { increment: 1 } } });
  });
  it('locks after five guesses', async () => {
    mocks.find.mockResolvedValue({ ...validRecord(), attempts: 5 });
    await expect(verifyOtp(phone, '012345')).rejects.toMatchObject({ code: 'OTP_LOCKED' });
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
