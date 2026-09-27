import { prisma, type ConsentPurpose } from '@hq/database';
import { writeAudit } from '../audit.js';

// The user row exists before either the consent or device row. Locking it also
// serializes the first registration against a first explicit opt-out.
export async function registerDevice(userId: string, fcmToken: string, platform: 'IOS' | 'ANDROID') {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const consent = await tx.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose: 'PUSH_NOTIFICATIONS' } },
    });
    if (consent?.granted === false) return { registered: false };
    await tx.deviceToken.upsert({
      where: { fcmToken },
      update: { userId, platform, lastSeenAt: new Date() },
      create: { userId, fcmToken, platform },
    });
    // A token identifies a destination; it is not permission to send to it.
    return { registered: true };
  }, { timeout: 30_000, maxWait: 30_000 });
}

export async function setConsent(userId: string, purpose: ConsentPurpose, granted: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const now = new Date();
    const consent = await tx.consentRecord.upsert({
      where: { userId_purpose: { userId, purpose } },
      update: {
        granted,
        source: 'EXPLICIT',
        withdrawnAt: granted ? null : now,
        ...(granted ? { grantedAt: now } : {}),
      },
      create: { userId, purpose, granted, source: 'EXPLICIT', withdrawnAt: granted ? null : now },
    });
    if (purpose === 'PUSH_NOTIFICATIONS' && !granted)
      await tx.deviceToken.deleteMany({ where: { userId } });
    await writeAudit({ actorId: userId, action: granted ? 'consent.grant' : 'consent.withdraw', target: purpose }, tx);
    return { purpose: consent.purpose, granted: consent.granted };
  }, { timeout: 30_000, maxWait: 30_000 });
}
