import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomInt } from 'node:crypto';

/** Argon2id password hashing (TRD §14). */
export function hashPassword(password: string): Promise<string> {
  return argonHash(password); // @node-rs/argon2 defaults to argon2id
}
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argonVerify(hash, password);
}

/** OTP codes are short-lived + rate-limited, so a fast SHA-256 hash is sufficient. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
