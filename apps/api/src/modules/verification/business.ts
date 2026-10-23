import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@hq/database';
import { businessVerificationSchema, type ClientAccountType } from '@hq/shared';
import { ApiError } from '../../app.js';
import { consumeUpload, lockUploadOwner } from '../storage/uploads.js';
import { writeAudit } from '../audit.js';
import type { KycPort, BusinessLookupResult } from './port/kyc-port.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
async function lockClient(tx: Prisma.TransactionClient, userId: string) {
  await lockUploadOwner(tx, userId);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role !== 'CLIENT' || user.status !== 'ACTIVE')
    throw new ApiError(403, 'NOT_A_CLIENT', 'An active client account is required.');
  await tx.$queryRaw`SELECT id FROM clients WHERE "userId" = ${userId}::uuid FOR UPDATE`;
  return tx.client.findUniqueOrThrow({ where: { userId } });
}

export async function chooseClientAccountType(userId: string, accountType: ClientAccountType) {
  return prisma.$transaction(async (tx) => {
    const client = await lockClient(tx, userId);
    if (client.accountType === accountType) return client;
    // An organisation cannot shed a pending/rejected check by switching its label.
    if (client.accountType === 'BUSINESS')
      throw new ApiError(
        409,
        'ACCOUNT_TYPE_LOCKED',
        'Contact support to change a business account.',
      );
    return tx.client.update({
      where: { id: client.id },
      data: { accountType, businessName: null },
    });
  }, TX);
}

export async function submitBusinessVerification(userId: string, body: unknown, kyc: KycPort) {
  const input = businessVerificationSchema.parse(body);
  if (!kyc.verifyBusiness)
    throw new ApiError(
      503,
      'KYB_UNAVAILABLE',
      'Business verification is temporarily unavailable. Contact support.',
    );
  const prepared = await prisma.$transaction(async (tx) => {
    const client = await lockClient(tx, userId);
    if (client.accountType !== 'BUSINESS' || client.verificationStatus !== 'VERIFIED')
      throw new ApiError(
        403,
        'IDENTITY_REQUIRED',
        'Verify the business representative’s identity first.',
      );
    const latest = await tx.businessVerification.findFirst({
      where: { clientId: client.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (latest && latest.status !== 'REJECTED') return { record: latest, created: false };
    const attempts = await tx.businessVerification.count({
      where: { clientId: client.id, createdAt: { gt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    });
    if (attempts >= 5)
      throw new ApiError(
        429,
        'KYB_ATTEMPTS_EXCEEDED',
        'Too many business verification attempts. Try again after six hours.',
      );
    const id = randomUUID();
    await consumeUpload(tx, {
      key: input.authorizationKey,
      ownerId: userId,
      scopeId: client.id,
      purpose: 'business-authorization',
      reference: `business-verification:${id}`,
    });
    const record = await tx.businessVerification.create({
      data: {
        id,
        clientId: client.id,
        registeredName: input.registeredName,
        registrationNumber: input.registrationNumber,
        businessType: input.businessType,
        representativeRole: input.representativeRole,
        authorizationKey: input.authorizationKey,
        environment: 'unknown',
        registryStatus: 'PROCESSING',
        createdAt: new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)),
      },
    });
    await tx.client.update({
      where: { id: client.id },
      data: { businessVerificationStatus: 'PENDING', businessVerifiedAt: null, businessName: null },
    });
    return { record, created: true };
  }, TX);
  if (!prepared.created) return prepared.record;
  const result = await kyc
    .verifyBusiness({
      referenceId: prepared.record.id,
      clientId: prepared.record.clientId,
      registrationNumber: input.registrationNumber,
      businessType: input.businessType,
    })
    .catch(
      () =>
        ({
          status: 'UNAVAILABLE',
          registeredName: null,
          providerJobId: null,
          environment: 'unknown',
        }) as const,
    );
  await saveRegistryResult(userId, prepared.record.id, result);
  await writeAudit({
    actorId: userId,
    action: 'business_verification.submit',
    target: prepared.record.id,
  });
  return prisma.businessVerification.findUniqueOrThrow({ where: { id: prepared.record.id } });
}

async function saveRegistryResult(
  userId: string,
  id: string,
  result: Omit<BusinessLookupResult, 'environment'> & { environment: string },
) {
  return prisma.$transaction(async (tx) => {
    await lockClient(tx, userId);
    const current = await tx.businessVerification.findUniqueOrThrow({ where: { id } });
    if (current.status !== 'PENDING' || current.reviewedById) return;
    await tx.businessVerification.update({
      where: { id },
      data: {
        registryStatus: result.status,
        registryName: result.registeredName,
        providerJobId: result.providerJobId,
        environment: result.environment,
      },
    });
  }, TX);
}

export async function refreshBusinessVerification(id: string, kyc: KycPort) {
  const record = await prisma.businessVerification.findUniqueOrThrow({
    where: { id },
    include: { client: true },
  });
  if (!kyc.businessResult)
    throw new ApiError(503, 'KYB_UNAVAILABLE', 'Business verification is unavailable.');
  if (record.status !== 'PENDING') return;
  const result = await kyc.businessResult({
    referenceId: id,
    clientId: record.clientId,
    registrationNumber: record.registrationNumber,
    businessType: businessVerificationSchema.shape.businessType.parse(record.businessType),
  });
  await saveRegistryResult(record.client.userId, id, result);
}

export async function reviewBusinessVerification(params: {
  id: string;
  adminId: string;
  decision: 'APPROVED' | 'REJECTED';
  note: string;
  authorityConfirmed: boolean;
}) {
  const record = await prisma.businessVerification.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'Business verification not found.');
  await prisma.$transaction(async (tx) => {
    const client = await lockClient(tx, record.client.userId);
    const current = await tx.businessVerification.findFirst({
      where: { clientId: client.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (current?.id !== record.id || current.status !== 'PENDING')
      throw new ApiError(
        409,
        'STALE_VERIFICATION',
        'Review the latest pending business verification.',
      );
    const approved = params.decision === 'APPROVED';
    if (
      approved &&
      (client.verificationStatus !== 'VERIFIED' ||
        current.registryStatus !== 'VERIFIED' ||
        !current.registryName ||
        !current.authorizationKey ||
        !params.authorityConfirmed ||
        (process.env.NODE_ENV === 'production' && current.environment !== 'production'))
    )
      throw new ApiError(
        409,
        'BUSINESS_EVIDENCE_REQUIRED',
        'Verified identity, registry evidence, and authority to represent the business are required.',
      );
    const now = new Date();
    await tx.businessVerification.update({
      where: { id: current.id },
      data: {
        status: params.decision,
        reviewedById: params.adminId,
        reviewNote: params.note,
        reviewedAt: now,
      },
    });
    await tx.client.update({
      where: { id: client.id },
      data: {
        businessVerificationStatus: approved ? 'VERIFIED' : 'REJECTED',
        businessVerifiedAt: approved ? now : null,
        businessName: approved ? current.registryName : null,
      },
    });
    await writeAudit(
      {
        actorId: params.adminId,
        action: approved ? 'business_verification.approve' : 'business_verification.reject',
        target: current.id,
      },
      tx,
    );
  }, TX);
}
