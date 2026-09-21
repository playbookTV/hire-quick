import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('STAGING_QA_OTP_CODE', '');
  vi.stubEnv('KYC_MODE', 'dojah');
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
    'DOJAH_APP_ID',
    'DOJAH_SECRET_KEY',
    'DOJAH_WIDGET_ID',
  ])
    vi.stubEnv(key, 'unit-fixture');
  vi.stubEnv('OTP_VERIFIER_SECRET', 'c'.repeat(32));
  vi.stubEnv('OTP_VERIFIER_KEY_ID', 'new');
  vi.stubEnv('OTP_VERIFIER_PREVIOUS_SECRET', '');
  vi.stubEnv('OTP_VERIFIER_PREVIOUS_KEY_ID', '');
});

describe('manual identity review for client testing', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('KYC_MODE', 'manual');
    for (const key of ['DOJAH_APP_ID', 'DOJAH_SECRET_KEY', 'DOJAH_WIDGET_ID'])
      vi.stubEnv(key, '');
  });
  it('starts staging without Dojah while retaining manual document review', async () => {
    const { env } = await import('../../../env.js');
    expect(env.KYC_MODE).toBe('manual');
  });
  it('still requires Dojah by default', async () => {
    vi.stubEnv('KYC_MODE', 'dojah');
    await expect(import('../../../env.js')).rejects.toThrow('DOJAH_APP_ID');
  });
  it('rejects manual testing mode in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(import('../../../env.js')).rejects.toThrow('KYC_MODE');
  });
  it.each(['OTP_VERIFIER_SECRET', 'PAYSTACK_WEBHOOK_SECRET', 'STORAGE_BUCKET'])(
    'keeps the %s startup requirement', async (key) => {
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
