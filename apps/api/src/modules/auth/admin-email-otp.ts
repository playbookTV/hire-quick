import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@hq/database';
import { z } from 'zod';
import { ApiError } from '../../app.js';
import { writeAudit } from '../audit.js';
import { sendEmail } from '../notifications/brevo.js';
import { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from './hash.js';
import { signAccessToken, signRefreshToken } from './tokens.js';
import type { AuthResult } from './otp.js';

export const adminEmailSchema = z.string().trim().toLowerCase().max(254).email();
const TX = { timeout: 30_000, maxWait: 30_000 };
const MAX_REQUESTS_PER_HOUR = 5;
const invalid = () =>
  new ApiError(400, 'OTP_INVALID', 'Invalid or expired code. Request a new code.');

async function lockEmail(tx: Prisma.TransactionClient, email: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-admin-email:${email}`}, 0))::text`;
}

async function eligibleAdmin(tx: Prisma.TransactionClient, email: string) {
  // PostgreSQL's email uniqueness is case-sensitive. Ambiguous case variants
  // must fail closed, including a collision with a non-admin account.
  const matches = await tx.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    take: 2,
  });
  const user = matches[0];
  return matches.length === 1 && user?.role === 'ADMIN' && user.status === 'ACTIVE' ? user : null;
}

export async function requestAdminEmailOtp(input: string): Promise<{ sent: boolean }> {
  const email = adminEmailSchema.parse(input);
  const code = generateOtp();
  const issued = await prisma.$transaction(async (tx) => {
    await lockEmail(tx, email);
    const user = await eligibleAdmin(tx, email);
    if (!user) return null;
    const subjectRef = `admin-email:${email}:${user.id}`;
    const now = new Date();
    const recent = await tx.verificationCode.count({
      where: {
        purpose: 'AUTH',
        subjectRef,
        createdAt: { gte: new Date(now.getTime() - 3_600_000) },
      },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many code requests. Try again later.');
    }
    await tx.verificationCode.updateMany({
      where: { purpose: 'AUTH', subjectRef, consumedAt: null },
      data: { expiresAt: now },
    });
    const binding = { purpose: 'AUTH' as const, subjectRef, id: randomUUID() };
    await tx.verificationCode.create({
      data: {
        ...binding,
        codeHash: hashOtp(code, binding),
        createdAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
    });
    return binding;
  }, TX);
  // Do not disclose account eligibility or create accounts through this route.
  if (!issued) return { sent: true };
  const sent = await sendEmail(
    email,
    'Your HireQuick admin sign-in code',
    `<p>Your HireQuick admin sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this code, ignore this email.</p>`,
  );
  if (!sent) {
    // A later request may already have issued another code; invalidate only ours.
    await prisma.$transaction(async (tx) => {
      await lockEmail(tx, email);
      await tx.verificationCode.updateMany({
        where: { id: issued.id, consumedAt: null },
        data: { expiresAt: new Date() },
      });
    }, TX);
  }
  return { sent };
}

export async function verifyAdminEmailOtp(input: string, code: string): Promise<AuthResult> {
  const email = adminEmailSchema.parse(input);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockEmail(tx, email);
    const candidate = await eligibleAdmin(tx, email);
    if (!candidate) return { error: invalid() };
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.id}::uuid FOR UPDATE`;
    const user = await eligibleAdmin(tx, email);
    if (!user || user.id !== candidate.id) return { error: invalid() };
    const subjectRef = `admin-email:${email}:${user.id}`;
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
    if (!rec) return { error: invalid() };
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      return { error: new ApiError(429, 'OTP_LOCKED', 'Too many attempts. Request a new code.') };
    }
    if (!verifyOtpHash(rec.codeHash, code, { purpose: 'AUTH', subjectRef, id: rec.id })) {
      const updated = await tx.verificationCode.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts === OTP_MAX_ATTEMPTS) {
        await writeAudit(
          { actorId: user.id, action: 'auth.admin_email_otp.locked', target: user.id },
          tx,
        );
      }
      // Commit the failed attempt before throwing outside the transaction.
      return { error: invalid() };
    }
    await tx.verificationCode.update({ where: { id: rec.id }, data: { consumedAt: now } });
    const refreshToken = await signRefreshToken(user.id);
    const accessToken = await signAccessToken(user.id, user.role, refreshToken);
    await writeAudit(
      {
        actorId: user.id,
        action: 'auth.login',
        target: user.id,
        metadata: { newUser: false, role: user.role, channel: 'admin_email' },
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
