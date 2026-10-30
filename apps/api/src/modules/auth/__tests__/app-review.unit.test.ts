import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@hq/database';

const NOW = new Date('2026-10-24T09:00:00Z');
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn(),
  user: vi.fn(),
  createUser: vi.fn(),
  count: vi.fn(),
  invalidate: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  sms: vi.fn(),
  whatsapp: vi.fn(),
  kudi: vi.fn(),
  access: vi.fn(),
  refresh: vi.fn(),
  audit: vi.fn(),
  env: {
    NODE_ENV: 'production',
    PAYSTACK_SECRET_KEY: 'sk_live_fixture',
    STAGING_QA_OTP_CODE: '',
    APP_REVIEW_PHONE: '+2348031234567',
    APP_REVIEW_OTP_CODE: '480317',
    APP_REVIEW_LOGIN_UNTIL: '2026-11-07T23:59:00Z',
    OTP_VERIFIER_SECRET: 'fixture-secret-with-more-than-thirty-two-characters',
    OTP_VERIFIER_KEY_ID: 'v1',
    OTP_VERIFIER_PREVIOUS_SECRET: '',
    OTP_VERIFIER_PREVIOUS_KEY_ID: '',
  },
}));
vi.mock('@hq/database', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../../../env.js', () => ({ env: mocks.env }));
vi.mock('../../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../../app.js', () => ({
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../notifications/brevo.js', () => ({ sendSms: mocks.sms }));
vi.mock('../../notifications/twilio.js', () => ({
  whatsappConfigured: () => false,
  sendWhatsAppOtp: mocks.whatsapp,
}));
vi.mock('../../notifications/kudisms.js', () => ({
  kudiSmsConfigured: () => true,
  sendKudiSmsOtp: mocks.kudi,
}));
vi.mock('../tokens.js', () => ({ signAccessToken: mocks.access, signRefreshToken: mocks.refresh }));
vi.mock('../../audit.js', () => ({ writeAudit: mocks.audit }));
import { requestOtp, verifyOtp } from '../otp.js';
import { appReviewCode, appReviewConfig, reviewSubject, weakReviewCode } from '../app-review.js';
import { hashOtp, verifyOtpHash } from '../hash.js';

const phone = '+2348031234567';
const account = { id: 'review-client', phone, role: 'CLIENT', status: 'ACTIVE' };
const settings = {
  APP_REVIEW_PHONE: phone,
  APP_REVIEW_OTP_CODE: '480317',
  APP_REVIEW_LOGIN_UNTIL: '2026-11-07T23:59:00Z',
};
const tx = {
  $queryRaw: mocks.query,
  user: { findUnique: mocks.user, create: mocks.createUser },
  verificationCode: {
    count: mocks.count,
    updateMany: mocks.invalidate,
    create: mocks.create,
    findFirst: mocks.find,
    update: mocks.update,
  },
} as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(mocks.env, settings, {
    NODE_ENV: 'production',
    PAYSTACK_SECRET_KEY: 'sk_live_fixture',
  });
  mocks.transaction.mockImplementation((fn: (client: Prisma.TransactionClient) => unknown) =>
    fn(tx),
  );
  mocks.user.mockResolvedValue(account);
  mocks.count.mockResolvedValue(0);
  mocks.find.mockResolvedValue(null);
  mocks.kudi.mockResolvedValue(true);
  mocks.access.mockResolvedValue('access-fixture');
  mocks.refresh.mockResolvedValue('refresh-fixture');
  mocks.update.mockResolvedValue({ attempts: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('review login settings', () => {
  it('opens for a complete, strong setting that ends within 31 days', () => {
    expect(appReviewConfig(NOW)).toEqual({
      phone,
      code: '480317',
      until: new Date('2026-11-07T23:59:00Z'),
    });
  });
  it.each([
    { APP_REVIEW_PHONE: '' },
    { APP_REVIEW_OTP_CODE: '' },
    { APP_REVIEW_LOGIN_UNTIL: '' },
    { APP_REVIEW_PHONE: '08031234567' },
    { APP_REVIEW_OTP_CODE: '48031' },
    { APP_REVIEW_OTP_CODE: '4803a7' },
    { APP_REVIEW_LOGIN_UNTIL: 'next friday' },
  ])('stays off when incomplete or malformed (%j)', (change) => {
    Object.assign(mocks.env, change);
    expect(appReviewConfig(NOW)).toBeNull();
  });
  it.each(['000000', '111111', '123456', '345678', '987654', '543210'])(
    'refuses the guessable code %s',
    (code) => {
      expect(weakReviewCode(code)).toBe(true);
      mocks.env.APP_REVIEW_OTP_CODE = code;
      expect(appReviewConfig(NOW)).toBeNull();
    },
  );
  it('accepts an irregular code', () => {
    expect(weakReviewCode('480317')).toBe(false);
  });
  it('switches itself off at the end time', () => {
    expect(appReviewConfig(new Date('2026-11-07T23:58:59Z'))).not.toBeNull();
    expect(appReviewConfig(new Date('2026-11-07T23:59:00Z'))).toBeNull();
  });
  it('stays off while the end time is more than 31 days away', () => {
    mocks.env.APP_REVIEW_LOGIN_UNTIL = '2026-11-25T09:00:01Z';
    expect(appReviewConfig(NOW)).toBeNull();
    mocks.env.APP_REVIEW_LOGIN_UNTIL = '2026-11-24T09:00:00Z';
    expect(appReviewConfig(NOW)).not.toBeNull();
  });
});

describe('review account boundary', () => {
  it.each(['CLIENT', 'USHER'])('allows the configured active %s account', async (role) => {
    mocks.user.mockResolvedValue({ ...account, role });
    expect(await appReviewCode(tx, phone, NOW)).toBe('480317');
  });
  it.each([
    null,
    { ...account, role: 'ADMIN' },
    { ...account, status: 'SUSPENDED' },
    { ...account, status: 'ANONYMIZED' },
    { ...account, status: 'PENDING' },
  ])('refuses a missing, admin or inactive account (%j)', async (user) => {
    mocks.user.mockResolvedValue(user);
    expect(await appReviewCode(tx, phone, NOW)).toBeNull();
  });
  it('does not look up any other phone number', async () => {
    expect(await appReviewCode(tx, '+2348031234568', NOW)).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});

describe('review login uses the normal OTP lifecycle in production', () => {
  const validRecord = () => {
    const binding = {
      id: 'otp-fixture',
      purpose: 'AUTH' as const,
      subjectRef: reviewSubject(phone),
    };
    return { ...binding, codeHash: hashOtp('480317', binding), attempts: 0 };
  };
  it('issues a bound hash without sending or echoing the code', async () => {
    expect(await requestOtp(phone)).toEqual({ sent: true });
    const data = mocks.create.mock.calls[0]?.[0]
      .data as Prisma.VerificationCodeUncheckedCreateInput;
    expect(data.subjectRef).toBe(reviewSubject(phone));
    expect(
      verifyOtpHash(data.codeHash, '480317', {
        purpose: 'AUTH',
        subjectRef: data.subjectRef,
        id: data.id!,
      }),
    ).toBe(true);
    expect(mocks.kudi).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
  });
  it('enforces the hourly issuance limit', async () => {
    mocks.count.mockResolvedValue(5);
    await expect(requestOtp(phone)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('sends a real SMS once the window has closed', async () => {
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'));
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(mocks.kudi).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0]?.[0].data.subjectRef).toBe(phone);
  });
  it('sends a real SMS to an account that does not exist yet', async () => {
    mocks.user.mockResolvedValue(null);
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(mocks.kudi).toHaveBeenCalledOnce();
  });
  it('signs in the existing account and marks the login as a review login', async () => {
    mocks.find.mockResolvedValue(validRecord());
    const result = await verifyOtp(phone, '480317', 'USHER');
    expect(result.user).toEqual({ id: account.id, role: 'CLIENT', phone });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login',
        metadata: { newUser: false, role: 'CLIENT', appReview: true },
      }),
      tx,
    );
  });
  it('counts a wrong guess against the five-attempt lock', async () => {
    mocks.find.mockResolvedValue(validRecord());
    await expect(verifyOtp(phone, '480318')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'otp-fixture' },
      data: { attempts: { increment: 1 } },
    });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('stops accepting an issued code after the code is rotated', async () => {
    mocks.find.mockResolvedValue(validRecord());
    mocks.env.APP_REVIEW_OTP_CODE = '692041';
    await expect(verifyOtp(phone, '480317')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
