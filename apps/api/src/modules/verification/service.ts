import { providerMetadata } from './evidence.js';
/** Owner/profile locks serialize submissions, provider callbacks, erasure and manual review. */
import type { Prisma, PrismaClient, VerificationRejectReason } from '@hq/database';
import { consumeUpload, lockUploadOwner } from '../storage/uploads.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../app.js';
import type { KycIdentity, KycPort, KycResult } from './port/kyc-port.js';

const MAX_KYC_ATTEMPTS = 5;
const KYC_ATTEMPT_WINDOW_MS = 6 * 60 * 60 * 1000;
const TX = { timeout: 30_000, maxWait: 30_000 };
function assertCanStart(
  verificationStatus: string,
  recentAttempts: { createdAt: Date }[],
  now: number,
) {
  if (verificationStatus === 'VERIFIED')
    throw new ApiError(409, 'ALREADY_VERIFIED', 'identity is already verified');
  const limitingAttempt = recentAttempts[MAX_KYC_ATTEMPTS - 1];
  if (limitingAttempt) {
    const minutes = Math.max(
      1,
      Math.ceil((limitingAttempt.createdAt.getTime() + KYC_ATTEMPT_WINDOW_MS - now) / 60_000),
    );
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const wait = [
      hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
      remainingMinutes
        ? `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    throw new ApiError(
      429,
      'KYC_ATTEMPTS_EXCEEDED',
      `You've reached the limit of 5 verification attempts in 6 hours. Try again in ${wait}.`,
    );
  }
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
type Subject = { usherId: string; clientId?: never } | { clientId: string; usherId?: never };
const latest = (tx: Prisma.TransactionClient, subject: Subject) =>
  tx.usherVerification.findFirst({
    where: subject,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

async function lockUsher(tx: Prisma.TransactionClient, usherId: string) {
  const owner = await tx.usher.findUniqueOrThrow({
    where: { id: usherId },
    select: { userId: true },
  });
  await lockUploadOwner(tx, owner.userId);
  await tx.$queryRaw`SELECT id FROM ushers WHERE id = ${usherId}::uuid FOR UPDATE`;
  return tx.usher.findUniqueOrThrow({ where: { id: usherId } });
}

async function lockSubject(tx: Prisma.TransactionClient, subject: Subject) {
  if (subject.usherId) return lockUsher(tx, subject.usherId);
  const owner = await tx.client.findUniqueOrThrow({
    where: { id: subject.clientId! },
    select: { userId: true },
  });
  await lockUploadOwner(tx, owner.userId);
  await tx.$queryRaw`SELECT id FROM clients WHERE id = ${subject.clientId}::uuid FOR UPDATE`;
  return tx.client.findUniqueOrThrow({ where: { id: subject.clientId! } });
}

async function updateSubject(
  tx: Prisma.TransactionClient,
  subject: Subject,
  data: {
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    verifiedAt: Date | null;
    kycAttempts?: { increment: number };
  },
) {
  if (subject.usherId) await tx.usher.update({ where: { id: subject.usherId }, data });
  else await tx.client.update({ where: { id: subject.clientId! }, data });
}

function subjectOf(record: { usherId: string | null; clientId: string | null }): Subject {
  if (record.usherId) return { usherId: record.usherId };
  if (record.clientId) return { clientId: record.clientId };
  throw new ApiError(409, 'VERIFICATION_SUBJECT_MISSING', 'Verification has no account.');
}

async function submissionTime(tx: Prisma.TransactionClient, subject: Subject) {
  const previous = await latest(tx, subject);
  // Database now() uses transaction start time, which may precede a wait for the
  // subject lock. Assign a strictly increasing timestamp AFTER acquiring the lock.
  return new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
}

export async function startBiometricVerification(
  prisma: PrismaClient,
  userId: string,
  kyc: KycPort,
  identity: KycIdentity,
  reference?: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { usher: true, client: true },
  });
  const subject: Subject =
    user.role === 'USHER' && user.usher
      ? { usherId: user.usher.id }
      : user.role === 'CLIENT' && user.client
        ? { clientId: user.client.id }
        : (() => {
            throw new ApiError(
              403,
              'VERIFICATION_UNSUPPORTED',
              'This account cannot verify identity.',
            );
          })();
  const phone = user.phone;
  if (!phone)
    throw new ApiError(
      400,
      'PHONE_REQUIRED',
      'A phone number is required for identity verification.',
    );
  return prisma.$transaction(async (tx) => {
    const current = await lockSubject(tx, subject);
    if (reference) {
      const active = await latest(tx, subject);
      if (
        current.verificationStatus === 'VERIFIED' ||
        active?.providerReferenceId !== reference ||
        active.provider !== 'SMILE_ID' ||
        active.status !== 'PENDING' ||
        active.reviewedById ||
        Date.now() - active.createdAt.getTime() > 60 * 60 * 1000
      )
        throw new ApiError(409, 'STALE_VERIFICATION', 'Start a new identity check.');
      return kyc.startSession(reference, identity, phone);
    }
    // Read time after acquiring the lock so queued requests see expired attempts.
    // Keep history; only Smile sessions younger than 6 hours consume the budget.
    const now = Date.now();
    const smileAttempts = await tx.usherVerification.findMany({
      where: {
        ...subject,
        provider: 'SMILE_ID',
        method: 'BIOMETRIC',
        createdAt: { gt: new Date(now - KYC_ATTEMPT_WINDOW_MS) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_KYC_ATTEMPTS,
      select: { createdAt: true },
    });
    assertCanStart(current.verificationStatus, smileAttempts, now);
    const referenceId = randomUUID();
    const session = await kyc.startSession(referenceId, identity, phone);
    if (session.referenceId !== referenceId || !session.token)
      throw new ApiError(503, 'KYC_UNAVAILABLE', 'identity verification is unavailable');
    await tx.usherVerification.create({
      data: {
        ...subject,
        method: 'BIOMETRIC',
        provider: 'SMILE_ID',
        providerReferenceId: referenceId,
        govLookup: { environment: session.sandbox ? 'sandbox' : 'production' },
        status: 'PENDING',
        createdAt: await submissionTime(tx, subject),
      },
    });
    await updateSubject(tx, subject, {
      kycAttempts: { increment: 1 },
      verificationStatus: 'PENDING',
      verifiedAt: null,
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
        createdAt: await submissionTime(tx, { usherId }),
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
    const subject = subjectOf(candidate);
    const owner = await lockSubject(tx, subject);
    const user = await tx.user.findUniqueOrThrow({ where: { id: owner.userId } });
    if (user.status !== 'ACTIVE') return null;
    const current = await latest(tx, subject);
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
              ...providerMetadata(current.govLookup),
              providerJobId: result.providerJobId,
              providerStatus: result.providerStatus ?? 'processing',
              ...(result.nameCheck ? { nameCheck: result.nameCheck } : {}),
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
          ...providerMetadata(current.govLookup),
          providerJobId: result.providerJobId ?? null,
          providerStatus: result.providerStatus ?? null,
          livenessPassed: result.livenessPassed ?? null,
          faceMatchScore: result.faceMatchScore ?? null,
          watchListed: result.watchListed ?? null,
          idFound: result.idFound ?? null,
          ...(result.nameCheck ? { nameCheck: result.nameCheck } : {}),
        },
        reason: approved ? null : (result.reason ?? null),
        reasonCode: approved
          ? null
          : result.reasonCode && REJECT_REASONS.has(result.reasonCode)
            ? (result.reasonCode as VerificationRejectReason)
            : 'OTHER',
      },
    });
    await updateSubject(tx, subject, {
      verificationStatus: approved ? 'VERIFIED' : 'REJECTED',
      verifiedAt: approved ? reviewedAt : null,
    });
    return { id: current.id, userId: owner.userId, decision: result.decision };
  }, TX);
}

/** An explicit first admin review supersedes provider evidence for the active session. */
export async function reviewVerification(
  prisma: PrismaClient,
  params: {
    verificationId: string;
    adminId: string;
    decision: 'APPROVED' | 'REJECTED';
    evidenceJobId?: string | undefined;
    reason?: string;
    reasonCode?: VerificationRejectReason;
  },
) {
  const record = await prisma.usherVerification.findUnique({
    where: { id: params.verificationId },
  });
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'verification not found');
  return prisma.$transaction(async (tx) => {
    const subject = subjectOf(record);
    const owner = await lockSubject(tx, subject);
    const user = await tx.user.findUniqueOrThrow({ where: { id: owner.userId } });
    if (user.status !== 'ACTIVE')
      throw new ApiError(409, 'ACCOUNT_INACTIVE', 'Account is not active.');
    const current = await latest(tx, subject);
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
    const jobId = providerMetadata(current.govLookup).providerJobId;
    const hasEvidence =
      current.provider === 'SMILE_ID'
        ? !!jobId && params.evidenceJobId === jobId
        : !!current.idDocumentUrl && !!current.selfieUrl;
    if (approved && !hasEvidence)
      throw new ApiError(
        409,
        'EVIDENCE_REQUIRED',
        'Identity evidence must be available in this review before approval.',
      );
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
    await updateSubject(tx, subject, {
      verificationStatus: approved ? 'VERIFIED' : 'REJECTED',
      verifiedAt: approved ? reviewedAt : null,
    });
    return { changed: true };
  }, TX);
}
