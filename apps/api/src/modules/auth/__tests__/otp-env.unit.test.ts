import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('KUDISMS_API_KEY', '');
  vi.stubEnv('KUDISMS_SENDER_ID', 'HIREQUICK');
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET',
    'TWILIO_WHATSAPP_FROM', 'TWILIO_WHATSAPP_CONTENT_SID']) vi.stubEnv(key, '');
  vi.stubEnv('STAGING_QA_OTP_CODE', '');
  vi.stubEnv('KYC_MODE', 'smile');
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1/unused');
  vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(32));
  vi.stubEnv('JWT_REFRESH_SECRET', 'b'.repeat(32));
  for (const key of [
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_WEBHOOK_SECRET',
    'BREVO_API_KEY',
    'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'SMILE_PARTNER_ID',
    'SMILE_API_KEY',
  ])
    vi.stubEnv(key, 'unit-fixture');
  vi.stubEnv('SMILE_PARTNER_ID', '1234');
  vi.stubEnv('SMILE_ENVIRONMENT', 'production');
  vi.stubEnv('SMILE_CALLBACK_URL', 'https://api.example.com/webhooks/smile-id');
  vi.stubEnv('SMILE_PRIVACY_POLICY_URL', 'https://example.com/privacy');
  vi.stubEnv('OTP_VERIFIER_SECRET', 'c'.repeat(32));
  vi.stubEnv('OTP_VERIFIER_KEY_ID', 'new');
  vi.stubEnv('OTP_VERIFIER_PREVIOUS_SECRET', '');
  vi.stubEnv('OTP_VERIFIER_PREVIOUS_KEY_ID', '');
});

describe('manual identity review for client testing', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('KYC_MODE', 'manual');
    for (const key of ['SMILE_PARTNER_ID', 'SMILE_API_KEY']) vi.stubEnv(key, '');
  });
  it('starts staging without Smile ID while retaining manual document review', async () => {
    const { env } = await import('../../../env.js');
    expect(env.KYC_MODE).toBe('manual');
  });
  it('still requires Smile ID by default', async () => {
    vi.stubEnv('KYC_MODE', 'smile');
    await expect(import('../../../env.js')).rejects.toThrow('SMILE_PARTNER_ID');
  });
  it('rejects manual testing mode in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(import('../../../env.js')).rejects.toThrow('KYC_MODE');
  });
  it.each(['OTP_VERIFIER_SECRET', 'PAYSTACK_WEBHOOK_SECRET', 'STORAGE_BUCKET'])(
    'keeps the %s startup requirement',
    async (key) => {
      vi.stubEnv(key, '');
      await expect(import('../../../env.js')).rejects.toThrow(key);
    },
  );
  it('rejects misspelled modes', async () => {
    vi.stubEnv('KYC_MODE', 'manul');
    await expect(import('../../../env.js')).rejects.toThrow('KYC_MODE');
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('staging QA login configuration', () => {
  it('is disabled by default', async () => {
    const { env } = await import('../../../env.js');
    expect(env.STAGING_QA_OTP_CODE).toBe('');
  });
  it('accepts an explicit code with staging and test payment keys', async () => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STAGING_QA_OTP_CODE', '012345');
    await expect(import('../../../env.js')).resolves.toBeDefined();
  });
  it.each(['production', 'development', 'test'])('rejects QA login in %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STAGING_QA_OTP_CODE', '012345');
    await expect(import('../../../env.js')).rejects.toThrow('QA login requires staging');
  });
  it.each(['sk_live_fixture', '', 'sk_test'])('rejects non-test payment keys (%s)', async (key) => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('PAYSTACK_SECRET_KEY', key);
    vi.stubEnv('STAGING_QA_OTP_CODE', '012345');
    await expect(import('../../../env.js')).rejects.toThrow('STAGING_QA_OTP_CODE');
  });
  it.each(['12345', '1234567', 'abcdef'])('rejects malformed codes (%s)', async (code) => {
    vi.stubEnv('STAGING_QA_OTP_CODE', code);
    await expect(import('../../../env.js')).rejects.toThrow('STAGING_QA_OTP_CODE');
  });
});

describe('managed OTP key configuration', () => {
  it.each(['staging', 'production'])('%s requires a managed key', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('OTP_VERIFIER_SECRET', '');
    await expect(import('../../../env.js')).rejects.toThrow('OTP_VERIFIER_SECRET');
  });
  it.each(['staging', 'production'])('%s accepts distinct strong rotation keys', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('OTP_VERIFIER_PREVIOUS_SECRET', 'd'.repeat(32));
    vi.stubEnv('OTP_VERIFIER_PREVIOUS_KEY_ID', 'old');
    await expect(import('../../../env.js')).resolves.toBeDefined();
  });
  it('rejects partial rotation configuration', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('OTP_VERIFIER_PREVIOUS_KEY_ID', 'old');
    await expect(import('../../../env.js')).rejects.toThrow('configured together');
  });
  it('rejects reused key IDs', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('OTP_VERIFIER_PREVIOUS_SECRET', 'd'.repeat(32));
    vi.stubEnv('OTP_VERIFIER_PREVIOUS_KEY_ID', 'new');
    await expect(import('../../../env.js')).rejects.toThrow('must differ');
  });
  it('rejects weak configured secrets even in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OTP_VERIFIER_SECRET', 'too-short');
    await expect(import('../../../env.js')).rejects.toThrow('at least 32');
  });
  it('permits an ephemeral key in isolated tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('OTP_VERIFIER_SECRET', '');
    await expect(import('../../../env.js')).resolves.toBeDefined();
  });
});


describe('KudiSMS configuration', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'test'));
  it('uses the approved sender and leaves legacy delivery available without a key', async () => {
    vi.stubEnv('KUDISMS_SENDER_ID', undefined);
    const { env } = await import('../../../env.js');
    expect(env.KUDISMS_API_KEY).toBe('');
    expect(env.KUDISMS_SENDER_ID).toBe('HIREQUICK');
  });
  it('accepts a key with the approved sender', async () => {
    vi.stubEnv('KUDISMS_API_KEY', 'fixture-kudi-key');
    const { env } = await import('../../../env.js');
    expect(env.KUDISMS_API_KEY).toBe('fixture-kudi-key');
  });
  it.each(['', '   ', 'TOO-LONG-SENDER', 'HIRE\nQUICK'])('rejects an invalid sender (%j)', async (sender) => {
    vi.stubEnv('KUDISMS_API_KEY', 'fixture-kudi-key');
    vi.stubEnv('KUDISMS_SENDER_ID', sender);
    await expect(import('../../../env.js')).rejects.toThrow('KUDISMS_SENDER_ID');
  });
  it('rejects a whitespace-only key', async () => {
    vi.stubEnv('KUDISMS_API_KEY', '   ');
    await expect(import('../../../env.js')).rejects.toThrow('KUDISMS_API_KEY');
  });
});

describe('Twilio WhatsApp configuration', () => {
  const configured = {
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
    TWILIO_API_KEY_SECRET: 'fixture-twilio-secret',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+15551234567',
    TWILIO_WHATSAPP_CONTENT_SID: `HX${'c'.repeat(32)}`,
  };
  beforeEach(() => vi.stubEnv('NODE_ENV', 'test'));
  it('allows SMS-only operation with no Twilio configuration', async () => {
    const { env } = await import('../../../env.js');
    expect(env.TWILIO_ACCOUNT_SID).toBe('');
  });
  it('accepts a complete WhatsApp configuration', async () => {
    for (const [key, value] of Object.entries(configured)) vi.stubEnv(key, value);
    await expect(import('../../../env.js')).resolves.toBeDefined();
  });
  it.each(Object.keys(configured))('rejects missing %s when Twilio is configured', async (key) => {
    for (const [name, value] of Object.entries(configured)) vi.stubEnv(name, value);
    vi.stubEnv(key, '');
    await expect(import('../../../env.js')).rejects.toThrow(key);
  });
  it.each([
    ['TWILIO_ACCOUNT_SID', 'AC../invalid'],
    ['TWILIO_API_KEY_SID', 'not-a-key'],
    ['TWILIO_API_KEY_SECRET', '   '],
    ['TWILIO_WHATSAPP_FROM', '+15551234567'],
    ['TWILIO_WHATSAPP_CONTENT_SID', 'VA' + 'c'.repeat(32)],
  ])('rejects malformed %s', async (key, value) => {
    for (const [name, setting] of Object.entries(configured)) vi.stubEnv(name, setting);
    vi.stubEnv(key, value);
    await expect(import('../../../env.js')).rejects.toThrow(key);
  });
});
