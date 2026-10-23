/**
 * App-store review sign-in. Apple's reviewer cannot receive the Nigerian SMS
 * every other login uses, so one existing client or usher account may sign in
 * with a fixed code until a configured end time. Nothing is delivered and the
 * code is never echoed; the normal issuance limit, expiry, attempt lock and
 * single use still apply.
 *
 * Unlike most settings this fails closed instead of failing the boot: a bad or
 * expired value only switches review login off. A login setting that stopped
 * the API from starting caused the 19-23 October 2026 production outage.
 */
import type { Prisma } from '@hq/database';
import { env } from '../../env.js';
import { qaSubject, stagingQaCode } from './staging-qa.js';

/** Review login may be opened at most this far ahead, so it cannot be left on. */
export const APP_REVIEW_MAX_WINDOW_MS = 31 * 86_400_000;

export const reviewSubject = (phone: string): string => `review-auth:${phone}`;

/** Every OTP namespace a phone can hold codes in, for limits and invalidation. */
export const authSubjects = (phone: string): string[] => [
  phone,
  qaSubject(phone),
  reviewSubject(phone),
];

/** 000000, 123456 or 987654: guessable codes keep review login off. */
export function weakReviewCode(code: string): boolean {
  const digits = [...code].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]!);
  return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

export interface AppReviewConfig {
  phone: string;
  code: string;
  until: Date;
}

/** The review settings when complete, well formed and open at `now`; otherwise null. */
export function appReviewConfig(now: Date): AppReviewConfig | null {
  const phone = env.APP_REVIEW_PHONE;
  const code = env.APP_REVIEW_OTP_CODE;
  const until = new Date(env.APP_REVIEW_LOGIN_UNTIL);
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(code) || weakReviewCode(code))
    return null;
  if (Number.isNaN(until.getTime())) return null;
  const left = until.getTime() - now.getTime();
  return left > 0 && left <= APP_REVIEW_MAX_WINDOW_MS ? { phone, code, until } : null;
}

/** The fixed review code for this phone, or null when review login does not apply. */
export async function appReviewCode(
  tx: Prisma.TransactionClient,
  phone: string,
  now = new Date(),
): Promise<string | null> {
  const config = appReviewConfig(now);
  if (!config || config.phone !== phone) return null;
  // Keep eligibility stable until the OTP/session transaction commits.
  await tx.$queryRaw`SELECT id FROM users WHERE phone = ${phone} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { phone }, select: { role: true, status: true } });
  // Never creates an account, and never opens an admin session.
  return user?.status === 'ACTIVE' && (user.role === 'CLIENT' || user.role === 'USHER')
    ? config.code
    : null;
}

export interface FixedLogin {
  kind: 'staging-qa' | 'app-review';
  code: string;
  subjectRef: string;
}

/** A fixed-code login for this phone: staging QA identities, then app review. */
export async function fixedLogin(
  tx: Prisma.TransactionClient,
  phone: string,
): Promise<FixedLogin | null> {
  const qa = await stagingQaCode(tx, phone);
  if (qa) return { kind: 'staging-qa', code: qa, subjectRef: qaSubject(phone) };
  const review = await appReviewCode(tx, phone);
  if (review) return { kind: 'app-review', code: review, subjectRef: reviewSubject(phone) };
  return null;
}
