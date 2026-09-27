/**
 * Data-subject-rights logic (NDPR / TRD §14). Kept out of routes.ts so it can be
 * unit-tested directly. Erasure PSEUDONYMIZES — never DELETEs — because
 * Review/Dispute/Message/AuditLog hold Restrict FKs to User and financial
 * records must survive the 7-year retention window.
 */
import type { Prisma } from '@hq/database';
import { scheduleDeletion } from '../storage/uploads.js';
import { authorizedChatMediaKey } from '../storage/chat-media.js';
import { prisma, Prisma as PrismaValues } from '@hq/database';

const REDACTED = '[redacted]';

/** Assemble a machine-readable copy of everything we hold on this subject. */
export async function buildExport(userId: string): Promise<Record<string, unknown>> {
  const [
    user,
    client,
    usher,
    deviceTokens,
    reviewsAuthored,
    messagesSent,
    disputesRaised,
    consents,
    policyAcceptances,
    uploads,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, phone: true, email: true, status: true, createdAt: true },
    }),
    prisma.client.findUnique({ where: { userId } }),
    prisma.usher.findUnique({ where: { userId } }),
    prisma.deviceToken.findMany({ where: { userId } }),
    prisma.review.findMany({ where: { reviewerId: userId } }),
    prisma.message.findMany({ where: { senderId: userId } }),
    prisma.dispute.findMany({ where: { raisedById: userId } }),
    prisma.consentRecord.findMany({ where: { userId } }),
    prisma.policyAcceptance.findMany({ where: { userId } }),
    prisma.uploadIntent.findMany({ where: { ownerId: userId } }),
  ]);

  const usherData = usher
    ? await (async () => {
        const wallet = await prisma.wallet.findUnique({ where: { usherId: usher.id } });
        const [bankAccounts, verifications, bookings, walletLedger, withdrawals] =
          await Promise.all([
            prisma.bankAccount.findMany({ where: { usherId: usher.id } }),
            prisma.usherVerification.findMany({
              where: { usherId: usher.id },
              select: { id: true, status: true, reason: true, createdAt: true }, // not the doc URLs
            }),
            prisma.booking.findMany({ where: { usherId: usher.id } }),
            wallet ? prisma.walletLedger.findMany({ where: { walletId: wallet.id } }) : [],
            wallet ? prisma.withdrawal.findMany({ where: { walletId: wallet.id } }) : [],
          ]);
        return { usher, wallet, bankAccounts, verifications, bookings, walletLedger, withdrawals };
      })()
    : null;

  const clientData = client
    ? {
        client,
        orders: await prisma.order.findMany({
          where: { clientId: client.id },
          include: {
            checkout: {
              select: {
                orderId: true,
                email: true,
                state: true,
                reference: true,
                attemptedAt: true,
                expiresAt: true,
                lastCheckedAt: true,
                createdAt: true,
                updatedAt: true,
                // Hosted checkout URLs grant access; the export needs the payment
                // reference and state, not a reusable bearer URL.
              },
            },
          },
        }),
      }
    : null;

  return {
    exportedAt: new Date().toISOString(),
    user,
    client: clientData,
    usher: usherData,
    deviceTokens,
    reviewsAuthored,
    messagesSent,
    disputesRaised,
    consents,
    policyAcceptances,
    uploads,
  };
}

/**
 * Scrub supported identifying fields inside the caller's transaction, and
 * return the storage object keys (KYC docs, avatar, portfolio) that the caller
 * can attempt after commit. Durable deletion intents survive failures and worker restarts.
 */
export async function eraseUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ storageKeys: string[] }> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  const [client, usher] = await Promise.all([
    tx.client.findUnique({ where: { userId } }),
    tx.usher.findUnique({ where: { userId } }),
  ]);
  const storageKeys: string[] = [];

  // Inventory media before redaction. Validate historical keys against actual booking parties.
  const messages = await tx.message.findMany({
    where: { senderId: userId, contentType: { in: ['IMAGE', 'VOICE'] } },
    include: {
      conversation: {
        include: { booking: { include: { usher: true, event: { include: { client: true } } } } },
      },
    },
  });
  for (const message of messages) {
    const c = message.conversation;
    if (c.clientId !== c.booking.event.clientId || c.usherId !== c.booking.usherId) continue;
    const key = authorizedChatMediaKey(message, {
      bookingId: c.bookingId,
      clientUserId: c.booking.event.client.userId,
      usherUserId: c.booking.usher.userId,
    });
    if (key) storageKeys.push(key);
  }
  const uploads = await tx.uploadIntent.findMany({ where: { ownerId: userId } });
  for (const upload of uploads) {
    storageKeys.push(upload.key);
    // An issued PUT can still be used until expiration; preserve delayed staging cleanup.
    await scheduleDeletion(tx, upload.stagingKey, upload.attachExpiresAt);
  }
  for (const key of new Set(storageKeys)) await scheduleDeletion(tx, key);

  // Identity. phone is required + unique, so tombstone it deterministically.
  await tx.user.update({
    where: { id: userId },
    data: {
      email: null,
      phone: `deleted:${userId}`,
      passwordHash: null,
      status: 'ANONYMIZED',
      anonymizedAt: new Date(),
    },
  });

  // Free text authored by the subject.
  await tx.message.updateMany({ where: { senderId: userId }, data: { content: REDACTED } });
  await tx.review.updateMany({ where: { reviewerId: userId }, data: { comment: null } });
  await tx.dispute.updateMany({
    where: { raisedById: userId },
    data: { reason: REDACTED, note: null },
  });
  await tx.deviceToken.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });

  if (client) {
    await tx.client.update({
      where: { id: client.id },
      data: { displayName: 'Deleted user', businessName: null },
    });
    // Keep order/reference/state intact for delayed charges and refund recovery.
    // Checkout writers fence anonymization before storing contact details/URLs.
    await tx.checkout.updateMany({
      where: { order: { clientId: client.id } },
      data: { email: '', authorizationUrl: null },
    });
  }
  if (usher) {
    // Collect the storage object keys BEFORE clearing the references, so the
    // caller can delete the actual KYC docs / photos from object storage.
    const [photos, verifications] = await Promise.all([
      tx.photo.findMany({ where: { usherId: usher.id }, select: { imageUrl: true } }),
      tx.usherVerification.findMany({
        where: { usherId: usher.id },
        select: { idDocumentUrl: true, selfieUrl: true, govPhotoKey: true },
      }),
    ]);
    if (usher.avatarKey) storageKeys.push(usher.avatarKey);
    for (const p of photos) if (p.imageUrl) storageKeys.push(p.imageUrl);
    for (const v of verifications) {
      if (v.idDocumentUrl) storageKeys.push(v.idDocumentUrl);
      if (v.selfieUrl) storageKeys.push(v.selfieUrl);
      if (v.govPhotoKey) storageKeys.push(v.govPhotoKey);
    }

    for (const key of new Set(storageKeys)) {
      if (key.startsWith(`photos/${usher.id}/`) || key.startsWith(`verifications/${usher.id}/`))
        await scheduleDeletion(tx, key);
    }

    // Pseudonymize the public identity (name shown on cards/applications) and
    // drop the profile photo + portfolio so nothing resolves to the subject.
    await tx.usher.update({
      where: { id: usher.id },
      data: {
        displayName: 'Deleted user',
        bio: null,
        avatarKey: null,
        state: null,
        city: null,
        languages: [],
        yearsExperience: 0,
        dayRateKobo: null,
      },
    });
    await tx.photo.deleteMany({ where: { usherId: usher.id } });
    // Drop the document references; the actual objects are deleted from storage
    // by the cleanup worker after this transaction commits.
    await tx.usherVerification.updateMany({
      where: { usherId: usher.id },
      data: {
        idDocumentUrl: '',
        selfieUrl: '',
        nin: null,
        bvn: null,
        govPhotoKey: null,
        govLookup: PrismaValues.DbNull,
        reason: null,
      },
    });
    await tx.bankAccount.updateMany({
      where: { usherId: usher.id },
      data: { accountNumber: 'REDACTED', accountName: 'REDACTED', paystackRecipientCode: null },
    });
  }
  return { storageKeys: [...new Set(storageKeys)] };
}
