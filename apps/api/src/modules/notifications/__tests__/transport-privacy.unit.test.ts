/** No database or provider requests: prove mode isolation and secret-free logs. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'test' as 'development' | 'test' | 'staging' | 'production',
    PAYSTACK_SECRET_KEY: '',
    STAGING_QA_OTP_CODE: '',
    BREVO_API_KEY: '',
    BREVO_EMAIL_SENDER: 'verified-sender@example.com',
    BREVO_SMS_SENDER: 'HireQuick',
    KUDISMS_API_KEY: '',
    KUDISMS_SENDER_ID: 'HIREQUICK',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_API_KEY_SID: '',
    TWILIO_API_KEY_SECRET: '',
    TWILIO_WHATSAPP_FROM: '',
    TWILIO_WHATSAPP_CONTENT_SID: '',
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
    PAYSTACK_SECRET_KEY: '',
    STAGING_QA_OTP_CODE: '',
    BREVO_API_KEY: '',
    KUDISMS_API_KEY: '',
    KUDISMS_SENDER_ID: 'HIREQUICK',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_API_KEY_SID: '',
    TWILIO_API_KEY_SECRET: '',
    TWILIO_WHATSAPP_FROM: '',
    TWILIO_WHATSAPP_CONTENT_SID: '',
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
  });
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ sid: `SM${'d'.repeat(32)}`, status: 'queued' }), {
      status: 201,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const twilioSettings = {
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
  TWILIO_API_KEY_SECRET: 'twilio-key-secret',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+15551234567',
  TWILIO_WHATSAPP_CONTENT_SID: `HX${'c'.repeat(32)}`,
};

const modes = ['development', 'staging', 'production'] as const;
const phone = '+2348012345678';
const email = 'recipient@example.com';
const token = 'push-token-secret';
const code = '654321';

describe('KudiSMS corporate OTP', () => {
  beforeEach(() => {
    Object.assign(state.env, twilioSettings, {
      NODE_ENV: 'production',
      BREVO_API_KEY: 'brevo-fixture',
      KUDISMS_API_KEY: 'kudi-key-secret',
    });
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          error_code: '000',
          data: `${phone.slice(1)}|message-reference`,
        }),
      ),
    );
  });
  it('selects corporate SMS ahead of WhatsApp and Brevo with the existing code', async () => {
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://my.kudisms.net/api/corporate');
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(options!.body as string)).toEqual({
      token: 'kudi-key-secret',
      senderID: 'HIREQUICK',
      recipients: phone.slice(1),
      message: `Your HireQuick code is ${code}. It expires in 10 minutes.`,
    });
    const { sentNotifications } = await import('../test-recorder.js');
    expect(sentNotifications()).toEqual([]);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/kudi-key-secret|654321|2348012345678/);
  });
  it('keeps test delivery offline and recorded', async () => {
    state.env.NODE_ENV = 'test';
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true, devCode: code });
    expect(fetcher).not.toHaveBeenCalled();
    const { sentNotifications } = await import('../test-recorder.js');
    expect(sentNotifications()).toEqual([
      { kind: 'sms', to: phone, summary: expect.stringContaining(code) },
    ]);
  });
  it('does not send from an unconfigured adapter', async () => {
    state.env.KUDISMS_API_KEY = '';
    const { sendKudiSmsOtp } = await import('../kudisms.js');
    expect(await sendKudiSmsOtp(phone, code)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    '{}',
    'null',
    'not-json',
    JSON.stringify({ status: 'error', error_code: '100', msg: 'kudi-key-secret 654321' }),
    JSON.stringify({ status: 'success', error_code: '100', data: `${phone.slice(1)}|id` }),
    JSON.stringify({ status: 'success', error_code: '000' }),
    JSON.stringify({ status: 'success', error_code: '000', data: `${phone.slice(1)}|` }),
    JSON.stringify({ status: 'success', error_code: '000', data: '2348100000001|id' }),
  ])('fails closed without another paid delivery for an invalid response (%s)', async (body) => {
    fetcher.mockResolvedValue(new Response(body));
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/kudi-key-secret|654321|2348012345678/);
  });
  it.each([401, 429, 500])('handles HTTP %s without logging response content', async (status) => {
    fetcher.mockResolvedValue(new Response('kudi-key-secret 654321 2348012345678', { status }));
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/kudi-key-secret|654321|2348012345678/);
  });
  it('handles a timeout without retries or leaking error details', async () => {
    fetcher.mockRejectedValue(
      new DOMException('kudi-key-secret 654321 2348012345678', 'TimeoutError'),
    );
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/kudi-key-secret|654321|2348012345678/);
  });
  it.each([
    ['+15551234567', code],
    ['2348012345678', code],
    [phone + ',2348100000001', code],
    [phone, '12345'],
    [phone, '1234567'],
    [phone, 'abcdef'],
  ])('rejects unsupported recipients and malformed codes (%s, %s)', async (to, otp) => {
    const { sendKudiSmsOtp } = await import('../kudisms.js');
    expect(await sendKudiSmsOtp(to, otp)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Notification and OTP isolation', () => {
  it.each(modes)('%s never exposes OTPs or records/logs destination/payload data', async (mode) => {
    state.env.NODE_ENV = mode;
    const transport = await import('../brevo.js');
    const whatsapp = await import('../twilio.js');
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(await whatsapp.sendWhatsAppOtp(phone, code)).toBe(false);
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
      Object.assign(state.env, twilioSettings);
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
    Object.assign(state.env, twilioSettings);
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
      Object.assign(state.env, twilioSettings);
      state.env.FCM_PROJECT_ID = 'fixture-project';
      state.env.FCM_CLIENT_EMAIL = 'fixture-service@example.com';
      state.env.FCM_PRIVATE_KEY = 'private-key-secret';
      fetcher.mockRejectedValue(
        new Error(`twilio-key-secret brevo-key-secret ${phone} ${email} ${token} ${code}`),
      );
      const transport = await import('../brevo.js');
      const whatsapp = await import('../twilio.js');
      expect(await transport.sendSms(phone, code)).toBe(false);
      expect(await whatsapp.sendWhatsAppOtp(phone, code)).toBe(false);
      expect(await transport.sendEmail(email, code, code)).toBe(false);
      transport.recordPush(token, code);
      await vi.waitFor(() => expect(logs).toHaveBeenCalledWith('[brevo] push delivery failed'));
      fetcher.mockResolvedValue(new Response('provider-body-secret', { status: 400 }));
      expect(await transport.sendSms(phone, code)).toBe(false);
      expect(await whatsapp.sendWhatsAppOtp(phone, code)).toBe(false);
      expect(await transport.sendEmail(email, code, code)).toBe(false);
      const output = JSON.stringify(logs.mock.calls);
      for (const value of [
        phone,
        email,
        token,
        code,
        'brevo-key-secret',
        'twilio-key-secret',
        'private-key-secret',
        'provider-body-secret',
      ])
        expect(output).not.toContain(value);
      expect(transport.sentNotifications()).toEqual([]);
    },
  );
});

describe('Twilio WhatsApp delivery and SMS fallback', () => {
  beforeEach(() => {
    state.env.NODE_ENV = 'production';
    state.env.BREVO_API_KEY = 'brevo-key-secret';
    Object.assign(state.env, twilioSettings);
  });
  it('sends the authentication template with E.164 addresses and the existing code', async () => {
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSettings.TWILIO_ACCOUNT_SID}/Messages.json`,
    );
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSettings.TWILIO_API_KEY_SID}:${twilioSettings.TWILIO_API_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(form)).toEqual({
      To: `whatsapp:${phone}`,
      From: twilioSettings.TWILIO_WHATSAPP_FROM,
      ContentSid: twilioSettings.TWILIO_WHATSAPP_CONTENT_SID,
      ContentVariables: JSON.stringify({ '1': code }),
    });
    expect(state.create.mock.calls.at(-1)?.[0].data.codeHash).toBe('hashed-fixture');
  });
  it.each([400, 401, 429, 500])(
    'falls back to SMS with the same code on Twilio HTTP %s',
    async (status) => {
      fetcher.mockResolvedValueOnce(new Response('private-error-body', { status }));
      const { requestOtp } = await import('../../auth/otp.js');
      expect(await requestOtp(phone)).toEqual({ sent: true });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.brevo.com/v3/transactionalSMS/send');
      expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
        recipient: phone,
        content: `Your HireQuick code is ${code}. It expires in 10 minutes.`,
      });
    },
  );
  it('falls back after a timeout without logging exception secrets', async () => {
    fetcher.mockRejectedValueOnce(new Error(`timeout ${code} twilio-key-secret ${phone}`));
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/twilio-key-secret|654321|2348012345678/);
  });
  it('reports failure if both providers reject the code', async () => {
    fetcher.mockImplementation(async () => new Response('{}', { status: 503 }));
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    '{}',
    'null',
    'not-json',
    JSON.stringify({ sid: `SM${'d'.repeat(32)}`, status: 'failed' }),
    JSON.stringify({ sid: `SM${'d'.repeat(32)}`, status: 'queued', error_code: 63016 }),
  ])('does not report malformed or rejected provider results as success (%s)', async (body) => {
    fetcher.mockResolvedValueOnce(new Response(body, { status: 201 }));
    const { sendWhatsAppOtp } = await import('../twilio.js');
    expect(await sendWhatsAppOtp(phone, code)).toBe(false);
  });
  it('sends SMS directly when WhatsApp is not configured', async () => {
    state.env.TWILIO_WHATSAPP_FROM = '';
    const { requestOtp } = await import('../../auth/otp.js');
    expect(await requestOtp(phone)).toEqual({ sent: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.brevo.com/v3/transactionalSMS/send');
  });
  it.each([
    ['2348012345678', code],
    [phone, '12345'],
  ])('rejects malformed address/code', async (to, otp) => {
    const { sendWhatsAppOtp } = await import('../twilio.js');
    expect(await sendWhatsAppOtp(to, otp)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
