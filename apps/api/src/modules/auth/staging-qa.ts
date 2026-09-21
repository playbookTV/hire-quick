import type { Prisma } from '@hq/database';
import { env } from '../../env.js';

// Exact seeded identities only. Never create accounts or grant roles here.
const ACCOUNTS = [
  { phone: '+2348100000001', email: 'client.test@hirequick.dev', role: 'CLIENT' },
  { phone: '+2348100000011', email: 'usher.a@hirequick.dev', role: 'USHER' },
  { phone: '+2348100000012', email: 'usher.b@hirequick.dev', role: 'USHER' },
  { phone: '+2348100000013', email: 'usher.c@hirequick.dev', role: 'USHER' },
] as const;

export const qaSubject = (phone: string): string => `qa-auth:${phone}`;

export async function stagingQaCode(tx: Prisma.TransactionClient, phone: string): Promise<string | null> {
  if (env.NODE_ENV !== 'staging' || !env.PAYSTACK_SECRET_KEY.startsWith('sk_test_') ||
      !/^[0-9]{6}$/.test(env.STAGING_QA_OTP_CODE)) return null;
  const identity = ACCOUNTS.find((account) => account.phone === phone);
  if (!identity) return null;
  // Keep eligibility stable until the OTP/session transaction commits.
  await tx.$queryRaw`SELECT id FROM users WHERE phone = ${phone} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { phone }, select: { email: true, role: true, status: true },
  });
  return user?.status === 'ACTIVE' && user.email === identity.email && user.role === identity.role
    ? env.STAGING_QA_OTP_CODE : null;
}
