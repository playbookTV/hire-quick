import { prisma, type Prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import type { StoragePort } from './storage.js';

export type UploadPurpose = 'id' | 'selfie' | 'avatar' | 'portfolio' | 'IMAGE' | 'VOICE';
export const uploadLimit = (purpose: UploadPurpose): number =>
  (purpose === 'VOICE' ? 20 : 10) * 1024 * 1024;
export const STORAGE_TX = { timeout: 60_000, maxWait: 30_000 };

/** Also used by erasure: no issuance/attachment can commit behind anonymization. */
export async function lockUploadOwner(
  tx: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId}::uuid FOR UPDATE`;
  const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { status: true } });
  if (!owner || owner.status === 'ANONYMIZED' || owner.status === 'SUSPENDED')
    throw new ApiError(403, 'UPLOAD_UNAVAILABLE', 'This account cannot upload files.');
}

/** Shared lock for attaching, finalizing and deleting the same object. */
export async function lockObject(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export async function issueUpload(
  storage: StoragePort,
  input: {
    key: string;
    ownerId: string;
    scopeId: string;
    purpose: UploadPurpose;
    contentType: string;
    byteSize: number;
  },
) {
  if (
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > uploadLimit(input.purpose)
  )
    throw new ApiError(
      400,
      'FILE_TOO_LARGE',
      `Choose a file smaller than ${uploadLimit(input.purpose) / 1024 / 1024} MB.`,
    );
  const stagingKey = `staging/${input.key}`;
  const expiresAt = new Date(Date.now() + 300_000);
  const attachExpiresAt = new Date(Date.now() + 86_400_000);
  await prisma.$transaction(async (tx) => {
    await lockUploadOwner(tx, input.ownerId);
    await tx.uploadIntent.create({ data: { ...input, stagingKey, expiresAt, attachExpiresAt } });
    // Persist cleanup even if signing, uploading or finalizing never succeeds.
    await scheduleDeletion(tx, stagingKey, attachExpiresAt);
  }, STORAGE_TX);
  const url = await storage.presignUpload(stagingKey, input.contentType, input.byteSize);
  return { key: input.key, url, expiresAt, maxBytes: uploadLimit(input.purpose) };
}

/** Header/signature screening, not a malware scan or a complete media decoder. */
export function matchesSignature(type: string, prefix: Uint8Array): boolean {
  const b = Buffer.from(prefix);
  const text = (start: number, end: number) => b.toString('latin1', start, end);
  switch (type) {
    case 'image/jpg':
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/webp':
      return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
    case 'image/heic':
    case 'image/heif':
      return (
        text(4, 8) === 'ftyp' &&
        ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(text(8, 12))
      );
    case 'application/pdf':
      return text(0, 5) === '%PDF-';
    case 'audio/mp4':
      return (
        text(4, 8) === 'ftyp' && ['M4A ', 'M4B ', 'isom', 'mp41', 'mp42'].includes(text(8, 12))
      );
    case 'audio/mpeg':
      return text(0, 3) === 'ID3' || (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0);
    case 'audio/ogg':
      return text(0, 4) === 'OggS';
    case 'audio/wav':
      return text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE';
    default:
      return false;
  }
}

export async function finalizeUpload(storage: StoragePort, ownerId: string, key: string) {
  return prisma.$transaction(async (tx) => {
    await lockUploadOwner(tx, ownerId);
    await lockObject(tx, key);
    const upload = await tx.uploadIntent.findUnique({ where: { key } });
    if (!upload || upload.ownerId !== ownerId)
      throw new ApiError(400, 'INVALID_UPLOAD', 'Request a new upload for this file.');
    if (await tx.storageDeletion.findUnique({ where: { key } }))
      throw new ApiError(409, 'UPLOAD_EXPIRED', 'This upload is no longer available.');
    if (upload.finalizedAt) return { key };
    if (upload.expiresAt.getTime() <= Date.now())
      throw new ApiError(409, 'UPLOAD_EXPIRED', 'Upload expired. Please choose the file again.');
    let object;
    try {
      object = await storage.inspectObject(upload.stagingKey);
    } catch {
      throw new ApiError(
        409,
        'UPLOAD_INCOMPLETE',
        'The uploaded file could not be verified. Please try again.',
      );
    }
    if (
      object.size !== upload.byteSize ||
      object.contentType !== upload.contentType ||
      !matchesSignature(upload.contentType, object.prefix)
    )
      throw new ApiError(
        400,
        'INVALID_UPLOAD_CONTENT',
        'The uploaded file size or format does not match.',
      );
    // The source ETag ties the copy to the inspected bytes, even if the PUT URL is reused.
    try {
      await storage.copyObject(upload.stagingKey, key, object.etag, upload.contentType);
    } catch {
      throw new ApiError(
        409,
        'UPLOAD_INCOMPLETE',
        'The file could not be saved. Please try again.',
      );
    }
    await tx.uploadIntent.update({ where: { key }, data: { finalizedAt: new Date() } });
    return { key };
  }, STORAGE_TX);
}

/** One file → one purpose/scope/reference. Same-reference retries are idempotent. */
export async function consumeUpload(
  tx: Prisma.TransactionClient,
  input: {
    key: string;
    ownerId: string;
    scopeId: string;
    purpose: UploadPurpose;
    reference: string;
  },
): Promise<void> {
  await lockObject(tx, input.key);
  const upload = await tx.uploadIntent.findUnique({ where: { key: input.key } });
  if (
    !upload ||
    upload.ownerId !== input.ownerId ||
    upload.scopeId !== input.scopeId ||
    upload.purpose !== input.purpose ||
    !upload.finalizedAt
  )
    throw new ApiError(400, 'INVALID_UPLOAD', 'Upload and verify this file before saving it.');
  if (await tx.storageDeletion.findUnique({ where: { key: input.key } }))
    throw new ApiError(409, 'UPLOAD_EXPIRED', 'This file is no longer available.');
  if (upload.consumedBy === input.reference) return;
  if (upload.consumedBy)
    throw new ApiError(409, 'UPLOAD_ALREADY_USED', 'Upload a new copy for this attachment.');
  if (upload.attachExpiresAt.getTime() <= Date.now())
    throw new ApiError(409, 'UPLOAD_EXPIRED', 'Upload expired. Please choose the file again.');
  await tx.uploadIntent.update({
    where: { key: input.key },
    data: { consumedBy: input.reference, consumedAt: new Date() },
  });
}

/** Caller must validate ownership before queuing legacy keys. Never accepts URLs. */
export async function scheduleDeletion(
  tx: Prisma.TransactionClient,
  key: string,
  after = new Date(),
): Promise<void> {
  if (
    !/^(?:staging\/)?(?:photos|verifications|chat)\/[a-zA-Z0-9/_.-]+$/.test(key) ||
    key.includes('..')
  )
    return;
  await tx.storageDeletion.upsert({
    where: { key },
    create: { key, nextAttemptAt: after },
    update: {},
  });
}

async function hasReferences(tx: Prisma.TransactionClient, key: string): Promise<boolean> {
  const [avatar, photo, verification, message] = await Promise.all([
    tx.usher.findFirst({ where: { avatarKey: key }, select: { id: true } }),
    tx.photo.findFirst({ where: { imageUrl: key }, select: { id: true } }),
    tx.usherVerification.findFirst({
      where: { OR: [{ idDocumentUrl: key }, { selfieUrl: key }, { govPhotoKey: key }] },
      select: { id: true },
    }),
    tx.message.findFirst({ where: { content: key }, select: { id: true } }),
  ]);
  return Boolean(avatar || photo || verification || message);
}

export async function cleanupStorage(storage?: StoragePort, keys?: string[]) {
  const result = { deleted: 0, failed: 0, deferred: 0 };
  if (!storage) return result;
  // Expired unconsumed keys may exist after a successful copy followed by a DB failure.
  const abandoned = await prisma.$queryRaw<Array<{ key: string }>>`
    SELECT u.key FROM upload_intents u
    WHERE u."consumedAt" IS NULL AND u."attachExpiresAt" <= NOW()
      AND NOT EXISTS (SELECT 1 FROM storage_deletions d WHERE d.key = u.key)
      AND (${keys === undefined} OR u.key = ANY(${keys ?? []}::text[]))
    ORDER BY u."attachExpiresAt" LIMIT 100`;
  for (const upload of abandoned)
    await prisma.$transaction(async (tx) => {
      await lockObject(tx, upload.key);
      const current = await tx.uploadIntent.findUniqueOrThrow({ where: { key: upload.key } });
      if (!current.consumedAt) await scheduleDeletion(tx, upload.key);
    }, STORAGE_TX);
  const pending = await prisma.storageDeletion.findMany({
    where: {
      completedAt: null,
      nextAttemptAt: { lte: new Date() },
      ...(keys ? { key: { in: keys } } : {}),
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: 100,
  });
  for (const item of pending)
    await prisma.$transaction(async (tx) => {
      await lockObject(tx, item.key);
      const row = await tx.storageDeletion.findUniqueOrThrow({ where: { key: item.key } });
      if (row.completedAt || row.nextAttemptAt.getTime() > Date.now()) return;
      if (await hasReferences(tx, item.key)) {
        await tx.storageDeletion.update({
          where: { key: item.key },
          data: { nextAttemptAt: new Date(Date.now() + 3600_000), lastError: 'STILL_REFERENCED' },
        });
        result.deferred++;
        return;
      }
      try {
        await storage.deleteObject(item.key);
        await tx.storageDeletion.update({
          where: { key: item.key },
          data: { completedAt: new Date(), attempts: { increment: 1 }, lastError: null },
        });
        result.deleted++;
      } catch {
        // Never persist provider errors: they can contain credentials or object URLs.
        await tx.storageDeletion.update({
          where: { key: item.key },
          data: {
            attempts: { increment: 1 },
            lastError: 'STORAGE_DELETE_FAILED',
            nextAttemptAt: new Date(
              Date.now() + Math.min(86_400_000, 60_000 * 2 ** Math.min(row.attempts, 10)),
            ),
          },
        });
        result.failed++;
      }
    }, STORAGE_TX);
  return result;
}
