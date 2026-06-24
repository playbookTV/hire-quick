/**
 * Phone-OTP login (TRD §4/§7). Dev transport logs the code (real SMS provider —
 * Termii/Africa's Talking — wires in later). Rate-limited via the
 * verification_codes table so no Redis dependency for the core flow.
 */
import { prisma, type UserRole } from '@hq/database';
import { ApiError } from '../../app.js';
import { env } from '../../env.js';
import { generateOtp, hashOtp } from './hash.js';
import { signAccessToken, signRefreshToken } from './tokens.js';
import { sendSms, sendWhatsAppOtp } from '../notifications/brevo.js';
import { writeAudit } from '../audit.js';

const OTP_TTL_MS = 10 * 60_000;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export async function requestOtp(phone: string): Promise<{ sent: boolean; devCode?: string }> {
  const since = new Date(Date.now() - 3_600_000);
  const recent = await prisma.verificationCode.count({
    where: { purpose: 'AUTH', subjectRef: phone, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    throw new ApiError(429, 'RATE_LIMITED', 'too many OTP requests, try again later');
  }
  const code = generateOtp();
  await prisma.verificationCode.create({
    data: {
      purpose: 'AUTH',
      subjectRef: phone,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  // Prefer WhatsApp when a sender + approved template are configured (better fit
  // for the Lagos market and avoids SMS sender-ID/credit friction); otherwise
  // fall back to SMS / dev stub.
  const whatsappReady = !!env.BREVO_WHATSAPP_SENDER && env.BREVO_WHATSAPP_OTP_TEMPLATE_ID > 0;
  const sent = whatsappReady
    ? await sendWhatsAppOtp(phone, code)
    : await sendSms(phone, `Your HireQuick code is ${code}. It expires in 10 minutes.`);
  // Echo the code on any non-production env (dev/test/staging) so the deployed
  // staging instance stays testable while the WhatsApp channel is set up.
  // Production never echoes — delivery is the message itself.
  const echo = env.NODE_ENV !== 'production';
  return echo ? { sent, devCode: code } : { sent };
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; role: UserRole; phone: string };
}

export async function verifyOtp(phone: string, code: string, role?: UserRole): Promise<AuthResult> {
  const rec = await prisma.verificationCode.findFirst({
    where: { purpose: 'AUTH', subjectRef: phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) throw new ApiError(400, 'OTP_INVALID', 'no valid code; request a new one');
  if (rec.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'OTP_LOCKED', 'too many attempts');
  if (rec.codeHash !== hashOtp(code)) {
    const updated = await prisma.verificationCode.update({
      where: { id: rec.id },
      data: { attempts: { increment: 1 } },
    });
    // Audit only the transition into the locked state — not every subsequent
    // locked attempt — so a hammering attacker can't amplify audit writes.
    if (updated.attempts >= MAX_ATTEMPTS) {
      await writeAudit({ actorId: null, action: 'auth.otp.locked', target: phone });
    }
    throw new ApiError(400, 'OTP_INVALID', 'incorrect code');
  }
  await prisma.verificationCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });

  let user = await prisma.user.findUnique({ where: { phone } });
  // A suspended or erased account must not be able to re-authenticate, even with
  // a valid OTP (covers suspended admins too).
  if (user && (user.status === 'SUSPENDED' || user.status === 'ANONYMIZED')) {
    throw new ApiError(403, 'ACCOUNT_INACTIVE', 'this account cannot sign in');
  }
  const isNewUser = !user;
  if (!user) {
    const chosen: UserRole = role ?? 'CLIENT';
    user = await prisma.user.create({
      data: {
        phone,
        role: chosen,
        status: 'ACTIVE',
        ...(chosen === 'CLIENT' ? { client: { create: { displayName: phone } } } : {}),
        ...(chosen === 'USHER' ? { usher: { create: { wallet: { create: {} } } } } : {}),
      },
    });
  } else if (user.status === 'PENDING') {
    user = await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.role),
    signRefreshToken(user.id),
  ]);
  await writeAudit({
    actorId: user.id,
    action: 'auth.login',
    target: user.id,
    metadata: { newUser: isNewUser, role: user.role },
  });
  return { accessToken, refreshToken, user: { id: user.id, role: user.role, phone: user.phone } };
}
