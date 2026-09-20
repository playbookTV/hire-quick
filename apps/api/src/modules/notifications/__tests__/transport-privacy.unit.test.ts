/** No database or provider requests: prove mode isolation and secret-free logs. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'test' as 'development' | 'test' | 'staging' | 'production',
    BREVO_API_KEY: '',
    BREVO_EMAIL_SENDER: 'verified-sender@example.com',
    BREVO_SMS_SENDER: 'HireQuick',
    BREVO_WHATSAPP_SENDER: '',
    BREVO_WHATSAPP_OTP_TEMPLATE_ID: 0,
    BREVO_WHATSAPP_OTP_PARAM: 'code',
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
  },
  count: vi.fn().mockResolvedValue(0),
  create: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../env.js', () => ({ env: state.env }));
vi.mock('@hq/database', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn().mockResolvedValue([]),
        verificationCode: {
          count: state.count,
          create: state.create,
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      }),
  },
}));
vi.mock('../../../app.js', () => ({ ApiError: class extends Error {} }));
vi.mock('../../auth/hash.js', () => ({
  generateOtp: () => '654321',
  hashOtp: () => 'hashed-fixture',
  verifyOtpHash: vi.fn(),
  OTP_TTL_MS: 600_000,
  OTP_MAX_ATTEMPTS: 5,
}));
vi.mock('../../auth/tokens.js', () => ({ signAccessToken: vi.fn(), signRefreshToken: vi.fn() }));
vi.mock('../../audit.js', () => ({ writeAudit: vi.fn() }));
vi.mock('jose', () => ({
  SignJWT: vi.fn(),
  importPKCS8: vi
    .fn()
    .mockRejectedValue(
      new Error('private-key-secret push-token-secret OTP654321 recipient@example.com'),
    ),
}));

let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let logs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  Object.assign(state.env, {
    NODE_ENV: 'test',
    BREVO_API_KEY: '',
    BREVO_WHATSAPP_SENDER: '',
    BREVO_WHATSAPP_OTP_TEMPLATE_ID: 0,
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
  });
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 202 }));
  vi.stubGlobal('fetch', fetcher);
  logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const modes = ['development', 'staging', 'production'] as const;
const phone = '+2348012345678';
const email = 'recipient@example.com';
const token = 'push-token-secret';
const code = '654321';

describe('Notification and OTP isolation', () => {
  it.each(modes)('%s never exposes OTPs or records/logs destination/payload data', async (mode) => {
    state.env.NODE_ENV = mode;
    const transport = await import('../brevo.js');
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(await transport.sendWhatsAppOtp(phone, code)).toBe(false);
    expect(await transport.sendEmail(email, `OTP${code}`, 'sensitive-email-html')).toBe(false);
    transport.recordPush(token, 'sensitive-push-content');
    expect(transport.sentNotifications()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    const output = JSON.stringify(logs.mock.calls);
    for (const value of [
      phone,
      email,
      token,
      code,
      'sensitive-email-html',
      'sensitive-push-content',
    ])
      expect(output).not.toContain(value);
  });

  it.each(modes)(
    '%s sends configured messages without retaining data or returning the login code',
    async (mode) => {
      state.env.NODE_ENV = mode;
      state.env.BREVO_API_KEY = 'brevo-key-secret';
      state.env.BREVO_WHATSAPP_SENDER = 'fixture-sender';
      state.env.BREVO_WHATSAPP_OTP_TEMPLATE_ID = 123;
      const transport = await import('../brevo.js');
      const { requestOtp } = await import('../../auth/otp.js');
      expect(await requestOtp(phone)).toEqual({ sent: true });
      expect(await transport.sendSms(phone, `OTP${code}`)).toBe(true);
      expect(await transport.sendEmail(email, 'Private subject', 'Private body')).toBe(true);
      expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toMatchObject({
        sender: { name: 'HireQuick', email: 'verified-sender@example.com' },
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(transport.sentNotifications()).toEqual([]);
      expect(logs).not.toHaveBeenCalled();
    },
  );

  it('isolated tests echo the OTP and record intent without network even with provider keys present', async () => {
    state.env.BREVO_API_KEY = 'brevo-key-secret';
    state.env.BREVO_WHATSAPP_SENDER = 'fixture-sender';
    state.env.BREVO_WHATSAPP_OTP_TEMPLATE_ID = 123;
    state.env.FCM_PROJECT_ID = 'fixture-project';
    state.env.FCM_CLIENT_EMAIL = 'fixture-service@example.com';
    state.env.FCM_PRIVATE_KEY = 'private-key-secret';
    const transport = await import('../brevo.js');
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true, devCode: code });
    await transport.sendSms(phone, `OTP${code}`);
    await transport.sendEmail(email, 'Private subject', 'Private body');
    transport.recordPush(token, 'Private push');
    expect(transport.sentNotifications().map((record) => record.kind)).toEqual([
      'whatsapp',
      'sms',
      'email',
      'push',
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(logs).not.toHaveBeenCalled();
  });

  it('keeps only the newest100 test records and returns detached snapshots', async () => {
    const transport = await import('../brevo.js');
    for (let index = 0; index < 105; index++)
      await transport.sendSms(`fixture-${index}`, `message-${index}`);
    const snapshot = transport.sentNotifications();
    expect(snapshot).toHaveLength(100);
    expect(snapshot[0]?.to).toBe('fixture-5');
    expect(snapshot[99]?.to).toBe('fixture-104');
    snapshot[0]!.to = 'mutated';
    expect(transport.sentNotifications()[0]?.to).toBe('fixture-5');
    transport.clearSentNotifications();
    expect(transport.sentNotifications()).toEqual([]);
    expect(snapshot).toHaveLength(100);
  });

  it.each(modes)(
    '%s sanitizes network/provider failures, including FCM key errors',
    async (mode) => {
      state.env.NODE_ENV = mode;
      state.env.BREVO_API_KEY = 'brevo-key-secret';
      state.env.BREVO_WHATSAPP_SENDER = 'fixture-sender';
      state.env.BREVO_WHATSAPP_OTP_TEMPLATE_ID = 123;
      state.env.FCM_PROJECT_ID = 'fixture-project';
      state.env.FCM_CLIENT_EMAIL = 'fixture-service@example.com';
      state.env.FCM_PRIVATE_KEY = 'private-key-secret';
      fetcher.mockRejectedValue(new Error(`brevo-key-secret ${phone} ${email} ${token} ${code}`));
      const transport = await import('../brevo.js');
      expect(await transport.sendSms(phone, code)).toBe(false);
      expect(await transport.sendWhatsAppOtp(phone, code)).toBe(false);
      expect(await transport.sendEmail(email, code, code)).toBe(false);
      transport.recordPush(token, code);
      await vi.waitFor(() => expect(logs).toHaveBeenCalledWith('[brevo] push delivery failed'));
      fetcher.mockResolvedValue(new Response('provider-body-secret', { status: 400 }));
      expect(await transport.sendSms(phone, code)).toBe(false);
      expect(await transport.sendWhatsAppOtp(phone, code)).toBe(false);
      expect(await transport.sendEmail(email, code, code)).toBe(false);
      const output = JSON.stringify(logs.mock.calls);
      for (const value of [
        phone,
        email,
        token,
        code,
        'brevo-key-secret',
        'private-key-secret',
        'provider-body-secret',
      ])
        expect(output).not.toContain(value);
      expect(transport.sentNotifications()).toEqual([]);
    },
  );
});
