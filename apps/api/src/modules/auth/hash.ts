import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../../env.js';

/** Argon2id password hashing (TRD §14). */
export function hashPassword(password: string): Promise<string> {
  return argonHash(password); // @node-rs/argon2 defaults to argon2id
}
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argonVerify(hash, password);
}

/** Codes have at most ten minutes and five guesses, regardless of stored expiry. */
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface OtpBinding {
  purpose: 'AUTH' | 'ATTENDANCE';
  subjectRef: string;
  id: string;
}
export interface OtpKey {
  id: string;
  secret: string;
}
export interface OtpKeyring {
  current: OtpKey;
  previous?: OtpKey;
}

// Deployed environments require a managed secret in env.ts. Local processes
// without one intentionally invalidate their codes on restart; never use a
// known development secret that would permit offline enumeration of a DB dump.
const keys: OtpKeyring = {
  current: {
    id: env.OTP_VERIFIER_KEY_ID,
    secret: env.OTP_VERIFIER_SECRET || randomBytes(32).toString('hex'),
  },
  ...(env.OTP_VERIFIER_PREVIOUS_SECRET
    ? {
        previous: {
          id: env.OTP_VERIFIER_PREVIOUS_KEY_ID,
          secret: env.OTP_VERIFIER_PREVIOUS_SECRET,
        },
      }
    : {}),
};

function digest(code: string, binding: OtpBinding, key: OtpKey): Buffer {
  return createHmac('sha256', key.secret)
    .update(
      JSON.stringify(['hq-otp-v1', key.id, binding.purpose, binding.subjectRef, binding.id, code]),
    )
    .digest();
}

export function hashOtp(code: string, binding: OtpBinding, keyring: OtpKeyring = keys): string {
  return `v1:${keyring.current.id}:${digest(code, binding, keyring.current).toString('hex')}`;
}

/** Legacy SHA hashes and unknown/removed key versions require a new code. */
export function verifyOtpHash(
  stored: string,
  code: string,
  binding: OtpBinding,
  keyring: OtpKeyring = keys,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const match = /^v1:([a-zA-Z0-9_-]{1,32}):([a-f0-9]{64})$/.exec(stored);
  if (!match) return false;
  const key = [keyring.current, keyring.previous].find((candidate) => candidate?.id === match[1]);
  if (!key) return false;
  return timingSafeEqual(Buffer.from(match[2]!, 'hex'), digest(code, binding, key));
}
