import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
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
afterEach(() => vi.unstubAllEnvs());

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
