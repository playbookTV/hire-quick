/** One usher lock serializes submissions, provider callbacks and manual review. */
import type { Prisma, PrismaClient, VerificationRejectReason } from '@hq/database';
import { consumeUpload, lockUploadOwner } from '../storage/uploads.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../app.js';
import type { KycIdentity, KycPort, KycResult } from './port/kyc-port.js';

const MAX_KYC_ATTEMPTS = 5;
const TX = { timeout: 30_000, maxWait: 30_000 };
function assertCanStart(usher: { verificationStatus: string; kycAttempts: number }) {
  if (usher.verificationStatus === 'VERIFIED')
    throw new ApiError(409, 'ALREADY_VERIFIED', 'identity is already verified');
  if (usher.kycAttempts >= MAX_KYC_ATTEMPTS)
    throw new ApiError(
      429,
      'KYC_ATTEMPTS_EXCEEDED',
      'Too many verification attempts. Please contact support.',
    );
}
const REJECT_REASONS: ReadonlySet<string> = new Set<VerificationRejectReason>([
  'UNCLEAR_ID',
  'SELFIE_MISMATCH',
  'LIVENESS_FAILED',
  'ID_NOT_FOUND',
  'NAME_MISMATCH',
  'WATCHLISTED',
  'EXPIRED_DOCUMENT',
  'POOR_IMAGE',
  'OTHER',
]);
const latest = (tx: Prisma.TransactionClient, usherId: string) =>
  tx.usherVerification.findFirst({
    where: { usherId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

async function lockUsher(tx: Prisma.TransactionClient, usherId: string) {
  await tx.$queryRaw`SELECT id FROM ushers WHERE id = ${usherId}::uuid FOR UPDATE`;
  return tx.usher.findUniqueOrThrow({ where: { id: usherId } });
}

async function submissionTime(tx: Prisma.TransactionClient, usherId: string) {
  const previous = await latest(tx, usherId);
  // Database now() uses transaction start time, which may precede a wait for the
  // usher lock. Assign a strictly increasing timestamp AFTER acquiring the lock.
  return new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
}

export async function startBiometricVerification(
  prisma: PrismaClient,
  userId: string,
  kyc: KycPort,
  identity: KycIdentity,
  reference?: string,
) {
  const usher = await prisma.usher.findUnique({ where: { userId } });
  if (!usher) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers verify identity');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return prisma.$transaction(async (tx) => {
    const current = await lockUsher(tx, usher.id);
    if (reference) {
      const active = await latest(tx, usher.id);
      if (
        current.verificationStatus === 'VERIFIED' ||
        active?.providerReferenceId !== reference ||
        active.provider !== 'SMILE_ID' ||
        active.status !== 'PENDING' ||
        active.reviewedById ||
        Date.now() - active.createdAt.getTime() > 60 * 60 * 1000
      )
        throw new ApiError(409, 'STALE_VERIFICATION', 'Start a new identity check.');
      return kyc.startSession(reference, identity, user.phone);
    }
    // Provider migration must not carry failed Dojah sessions into Smile's cap.
    // Count committed Smile attempts under the same usher lock used to create them.
    const smileAttempts = await tx.usherVerification.count({
      where: { usherId: usher.id, provider: 'SMILE_ID', method: 'BIOMETRIC' },
    });
    assertCanStart({ ...current, kycAttempts: smileAttempts });
    const referenceId = randomUUID();
    const session = await kyc.startSession(referenceId, identity, user.phone);
    if (session.referenceId !== referenceId || !session.token)
      throw new ApiError(503, 'KYC_UNAVAILABLE', 'identity verification is unavailable');
    await tx.usherVerification.create({
      data: {
        usherId: usher.id,
        method: 'BIOMETRIC',
        provider: 'SMILE_ID',
        providerReferenceId: referenceId,
        status: 'PENDING',
        createdAt: await submissionTime(tx, usher.id),
      },
    });
    await tx.usher.update({
      where: { id: usher.id },
      data: { kycAttempts: { increment: 1 }, verificationStatus: 'PENDING', verifiedAt: null },
    });
    return session;
  }, TX);
}

export async function submitDocumentVerification(
  prisma: PrismaClient,
  usherId: string,
  documents: { idDocumentUrl: string; selfieUrl: string },
  uploadOwnerId?: string,
) {
  return prisma.$transaction(async (tx) => {
    if (uploadOwnerId) await lockUploadOwner(tx, uploadOwnerId);
    const usher = await lockUsher(tx, usherId);
    if (usher.verificationStatus === 'VERIFIED')
      throw new ApiError(409, 'ALREADY_VERIFIED', 'identity is already verified');
    if (uploadOwnerId) {
      const existing = await tx.usherVerification.findFirst({ where: { usherId, ...documents } });
      if (existing) return existing;
    }
    const id = randomUUID();
    if (uploadOwnerId) {
      for (const [purpose, key] of [
        ['id', documents.idDocumentUrl],
        ['selfie', documents.selfieUrl],
      ] as const)
        await consumeUpload(tx, {
          key,
          ownerId: uploadOwnerId,
          scopeId: usherId,
          purpose,
          reference: `verification:${id}:${purpose}`,
        });
    }
    const record = await tx.usherVerification.create({
      data: {
        id,
        usherId,
        ...documents,
        method: 'DOCUMENT',
        status: 'PENDING',
        createdAt: await submissionTime(tx, usherId),
      },
    });
    await tx.usher.update({
      where: { id: usherId },
      data: { verificationStatus: 'PENDING', verifiedAt: null },
    });
    return record;
  }, TX);
}

/** Authenticated results can settle only the latest, still-pending biometric attempt. */
export async function applyKycResult(prisma: PrismaClient, referenceId: string, result: KycResult) {
  const matches = await prisma.usherVerification.findMany({
    where: { providerReferenceId: referenceId },
    take: 2,
  });
  // A reference must identify exactly one session. Do not guess on legacy duplicates.
  if (matches.length !== 1) return null;
  const candidate = matches[0]!;
  return prisma.$transaction(async (tx) => {
    const usher = await lockUsher(tx, candidate.usherId);
    const current = await latest(tx, usher.id);
    if (
      !current ||
      current.id !== candidate.id ||
      current.providerReferenceId !== referenceId ||
      current.method !== 'BIOMETRIC' ||
      current.provider !== 'SMILE_ID' ||
      current.status !== 'PENDING' ||
      current.reviewedById !== null
    )
      return null;
    if (result.decision === 'pending') {
      if (result.providerJobId)
        await tx.usherVerification.update({
          where: { id: current.id },
          data: {
            govLookup: {
              providerJobId: result.providerJobId,
              providerStatus: result.providerStatus ?? 'processing',
            },
          },
        });
      return null;
    }
    const approved = result.decision === 'verified';
    const reviewedAt = new Date();
    await tx.usherVerification.update({
      where: { id: current.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedAt,
        // Keep only curated signals. Never persist unencrypted government IDs/photos.
        nin: null,
        bvn: null,
        livenessPassed: result.livenessPassed ?? null,
        faceMatchScore: result.faceMatchScore ?? null,
        watchListed: result.watchListed ?? null,
        govLookup: {
          providerJobId: result.providerJobId ?? null,
          providerStatus: result.providerStatus ?? null,
          livenessPassed: result.livenessPassed ?? null,
          faceMatchScore: result.faceMatchScore ?? null,
          watchListed: result.watchListed ?? null,
          idFound: result.idFound ?? null,
        },
        reasonCode: approved
          ? null
          : result.reasonCode && REJECT_REASONS.has(result.reasonCode)
            ? (result.reasonCode as VerificationRejectReason)
            : 'OTHER',
      },
    });
    await tx.usher.update({
      where: { id: usher.id },
      data: {
        verificationStatus: approved ? 'VERIFIED' : 'REJECTED',
        verifiedAt: approved ? reviewedAt : null,
      },
    });
    return { id: current.id, userId: usher.userId, decision: result.decision };
  }, TX);
}

/** An explicit first admin review supersedes provider evidence for the active session. */
export async function reviewVerification(
  prisma: PrismaClient,
  params: {
    verificationId: string;
    adminId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
    reasonCode?: VerificationRejectReason;
  },
) {
  const record = await prisma.usherVerification.findUnique({
    where: { id: params.verificationId },
  });
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
  return prisma.$transaction(async (tx) => {
    await lockUsher(tx, record.usherId);
    const current = await latest(tx, record.usherId);
    if (current?.id !== record.id)
      throw new ApiError(409, 'STALE_VERIFICATION', 'review the latest verification submission');
    if (current.reviewedById !== null) {
      if (current.status === params.decision) return { changed: false };
      throw new ApiError(
        409,
        'VERIFICATION_ALREADY_REVIEWED',
        'verification already has a manual decision',
      );
    }
    const approved = params.decision === 'APPROVED';
    const reviewedAt = new Date();
    await tx.usherVerification.update({
      where: { id: record.id },
      data: {
        status: params.decision,
        reviewedById: params.adminId,
        reviewedAt,
        reason: approved ? null : (params.reason ?? null),
        reasonCode: approved ? null : (params.reasonCode ?? 'OTHER'),
      },
    });
    await tx.usher.update({
      where: { id: record.usherId },
      data: {
        verificationStatus: approved ? 'VERIFIED' : 'REJECTED',
        verifiedAt: approved ? reviewedAt : null,
      },
    });
    return { changed: true };
  }, TX);
}
