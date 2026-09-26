/**
 * Phone-OTP login (TRD §4/§7). Codes are delivered through the configured
 * transport, except explicitly enabled seeded staging QA identities and tests. Rate-limited via the
 * verification_codes table so no Redis dependency for the core flow.
 */
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma, type UserRole } from '@hq/database';
import { ApiError } from '../../app.js';
import { env } from '../../env.js';
import { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from './hash.js';
import { signAccessToken, signRefreshToken } from './tokens.js';
import { sendSms } from '../notifications/brevo.js';
import { sendWhatsAppOtp, whatsappConfigured } from '../notifications/twilio.js';
import { kudiSmsConfigured, sendKudiSmsOtp } from '../notifications/kudisms.js';
import { writeAudit } from '../audit.js';
import { qaSubject, stagingQaCode } from './staging-qa.js';

const MAX_REQUESTS_PER_HOUR = 5;
const TX = { timeout: 30_000, maxWait: 30_000 };

async function lockPhone(tx: Prisma.TransactionClient, phone: string): Promise<void> {
  // No user row exists for a first login. The same transaction lock covers
  // issuance and verification, including concurrent first-time registrations.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-otp:${phone}`}, 0))::text`;
}

export async function requestOtp(phone: string): Promise<{ sent: boolean; devCode?: string }> {
  const { code, qaLogin } = await prisma.$transaction(async (tx) => {
    await lockPhone(tx, phone);
    const qaCode = await stagingQaCode(tx, phone);
    const code = qaCode ?? generateOtp();
    const subjects = { in: [phone, qaSubject(phone)] };
    const now = new Date();
    const recent = await tx.verificationCode.count({
      where: {
        purpose: 'AUTH',
        subjectRef: subjects,
        createdAt: { gte: new Date(now.getTime() - 3_600_000) },
      },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) {
      throw new ApiError(429, 'RATE_LIMITED', 'too many OTP requests, try again later');
    }
    await tx.verificationCode.updateMany({
      where: { purpose: 'AUTH', subjectRef: subjects, consumedAt: null },
      data: { expiresAt: now },
    });
    const binding = { purpose: 'AUTH' as const, subjectRef: qaCode ? qaSubject(phone) : phone, id: randomUUID() };
    await tx.verificationCode.create({
      data: {
        ...binding,
        codeHash: hashOtp(code, binding),
        createdAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    });
    return { code, qaLogin: qaCode !== null };
  }, TX);

  if (qaLogin) return { sent: true, devCode: code };

  // KudiSMS takes priority when configured. Do not retry another provider after
  // rejection or timeout: this could duplicate delivery and incur higher fees.
  let sent: boolean;
  if (kudiSmsConfigured()) {
    sent = await sendKudiSmsOtp(phone, code);
  } else {
    // Preserve existing deployments until their KudiSMS key is installed.
    sent = whatsappConfigured() && await sendWhatsAppOtp(phone, code);
    if (!sent) sent = await sendSms(phone, `Your HireQuick code is ${code}. It expires in 10 minutes.`);
  }
  // All other deployed accounts require delivery through the real transport.
  const echo = env.NODE_ENV === 'test';
  return echo ? { sent, devCode: code } : { sent };
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: UserRole; phone: string };
}

export async function verifyOtp(phone: string, code: string, role?: UserRole): Promise<AuthResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    await lockPhone(tx, phone);
    const qaCode = await stagingQaCode(tx, phone);
    const subjectRef = qaCode ? qaSubject(phone) : phone;
    const now = new Date();
    const rec = await tx.verificationCode.findFirst({
      where: {
        purpose: 'AUTH',
        subjectRef,
        consumedAt: null,
        expiresAt: { gt: now },
        createdAt: { gt: new Date(now.getTime() - OTP_TTL_MS) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!rec)
      return { error: new ApiError(400, 'OTP_INVALID', 'no valid code; request a new one') };
    if (rec.attempts >= OTP_MAX_ATTEMPTS)
      return { error: new ApiError(429, 'OTP_LOCKED', 'too many attempts') };
    if ((qaCode !== null && code !== qaCode) ||
        !verifyOtpHash(rec.codeHash, code, { purpose: 'AUTH', subjectRef, id: rec.id })) {
      const updated = await tx.verificationCode.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts === OTP_MAX_ATTEMPTS) {
        await writeAudit({ actorId: null, action: 'auth.otp.locked', target: phone }, tx);
      }
      // Return the error so the failed-attempt counter commits before throwing.
      return { error: new ApiError(400, 'OTP_INVALID', 'incorrect code') };
    }
    await tx.verificationCode.update({ where: { id: rec.id }, data: { consumedAt: now } });
    await tx.$queryRaw`SELECT id FROM users WHERE phone = ${phone} FOR UPDATE`;
    let user = await tx.user.findUnique({ where: { phone } });
    if (user && (user.status === 'SUSPENDED' || user.status === 'ANONYMIZED')) {
      throw new ApiError(403, 'ACCOUNT_INACTIVE', 'this account cannot sign in');
    }
    const isNewUser = !user;
    if (!user) {
      const chosen: UserRole = role ?? 'CLIENT';
      user = await tx.user.create({
        data: {
          phone,
          role: chosen,
          status: 'ACTIVE',
          ...(chosen === 'CLIENT' ? { client: { create: { displayName: phone } } } : {}),
          ...(chosen === 'USHER' ? { usher: { create: { wallet: { create: {} } } } } : {}),
        },
      });
    } else if (user.status === 'PENDING') {
      user = await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    }
    const refreshToken = await signRefreshToken(user.id);
    const accessToken = await signAccessToken(user.id, user.role, refreshToken);
    await writeAudit(
      {
        actorId: user.id,
        action: 'auth.login',
        target: user.id,
        metadata: { newUser: isNewUser, role: user.role },
      },
      tx,
    );
    return {
      result: {
        accessToken,
        refreshToken,
        user: { id: user.id, role: user.role, phone: user.phone },
      },
    };
  }, TX);
  if (outcome.error) throw outcome.error;
  return outcome.result;
}
