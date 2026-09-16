/**
 * Phone-OTP login (TRD §4/§7). Codes are delivered through the configured
 * transport and exposed directly only in isolated tests. Rate-limited via the
 * verification_codes table so no Redis dependency for the core flow.
 */
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma, type UserRole } from '@hq/database';
import { ApiError } from '../../app.js';
import { env } from '../../env.js';
import { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from './hash.js';
import { signAccessToken, signRefreshToken } from './tokens.js';
import { sendSms, sendWhatsAppOtp } from '../notifications/brevo.js';
import { writeAudit } from '../audit.js';

const MAX_REQUESTS_PER_HOUR = 5;
const TX = { timeout: 30_000, maxWait: 30_000 };

async function lockPhone(tx: Prisma.TransactionClient, phone: string): Promise<void> {
  // No user row exists for a first login. The same transaction lock covers
  // issuance and verification, including concurrent first-time registrations.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-otp:${phone}`}, 0))::text`;
}

export async function requestOtp(phone: string): Promise<{ sent: boolean; devCode?: string }> {
  const code = generateOtp();
  await prisma.$transaction(async (tx) => {
    await lockPhone(tx, phone);
    const now = new Date();
    const recent = await tx.verificationCode.count({
      where: {
        purpose: 'AUTH',
        subjectRef: phone,
        createdAt: { gte: new Date(now.getTime() - 3_600_000) },
      },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) {
      throw new ApiError(429, 'RATE_LIMITED', 'too many OTP requests, try again later');
    }
    await tx.verificationCode.updateMany({
      where: { purpose: 'AUTH', subjectRef: phone, consumedAt: null },
      data: { expiresAt: now },
    });
    const binding = { purpose: 'AUTH' as const, subjectRef: phone, id: randomUUID() };
    await tx.verificationCode.create({
      data: {
        ...binding,
        codeHash: hashOtp(code, binding),
        createdAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    });
  }, TX);

  // Prefer WhatsApp when a sender + approved template are configured (better fit
  // for the Lagos market and avoids SMS sender-ID/credit friction); otherwise
  // fall back to SMS / dev stub.
  const whatsappReady = !!env.BREVO_WHATSAPP_SENDER && env.BREVO_WHATSAPP_OTP_TEMPLATE_ID > 0;
  const sent = whatsappReady
    ? await sendWhatsAppOtp(phone, code)
    : await sendSms(phone, `Your HireQuick code is ${code}. It expires in 10 minutes.`);
  // Only isolated tests receive the code directly. Every deployed/dev runtime
  // requires delivery through its configured transport.
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
    const now = new Date();
    const rec = await tx.verificationCode.findFirst({
      where: {
        purpose: 'AUTH',
        subjectRef: phone,
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
    if (!verifyOtpHash(rec.codeHash, code, { purpose: 'AUTH', subjectRef: phone, id: rec.id })) {
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
