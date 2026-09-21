/**
 * S3-compatible object storage for KYC documents (TRD §14). Provider-agnostic:
 * works with AWS S3, Cloudflare R2, or Backblaze B2 by setting STORAGE_ENDPOINT
 * (empty = AWS default). Server mints short-lived presigned URLs so clients
 * upload/read directly without the bytes ever transiting the API, and document
 * objects live under server-owned keys the caller can't forge.
 */
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoragePort {
  presignUpload(key: string, contentType: string): Promise<string>;
  presignDownload(key: string, expiresInSec?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export interface StorageConfig {
  endpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  requestTimeoutMs?: number;
}

export function createS3Storage(cfg: StorageConfig): StoragePort {
  const client = new S3Client({
    region: cfg.region,
    // Custom endpoint (R2/B2/minio) needs path-style addressing.
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // Deletes are idempotent; allow one SDK retry inside the total deadline.
    maxAttempts: 2,
  });
  return {
    presignUpload: (key, contentType) =>
      getSignedUrl(client, new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }), {
        expiresIn: 300,
      }),
    presignDownload: (key, expiresInSec = 300) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: expiresInSec }),
    deleteObject: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(cfg.requestTimeoutMs ?? 15_000),
      });
    },
  };
}

interface StorageEnv {
  STORAGE_ENDPOINT: string;
  STORAGE_REGION: string;
  STORAGE_BUCKET: string;
  STORAGE_ACCESS_KEY: string;
  STORAGE_SECRET_KEY: string;
}

/** Build a storage port from env, or undefined when unconfigured (dev/test). */
export function createStorageFromEnv(env: StorageEnv): StoragePort | undefined {
  if (!env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) return undefined;
  return createS3Storage({
    endpoint: env.STORAGE_ENDPOINT || undefined,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
  });
}

const VERIFICATION_PREFIX = 'verifications';

/** Server-owned key for a verification document, scoped to the usher. */
export function verificationKey(usherId: string, kind: 'id' | 'selfie', ext: string): string {
  return `${VERIFICATION_PREFIX}/${usherId}/${kind}-${randomUUID()}.${ext}`;
}

/** A submitted key is only valid if it lives under the caller's own prefix. */
export function ownsVerificationKey(usherId: string, key: string): boolean {
  return key.startsWith(`${VERIFICATION_PREFIX}/${usherId}/`);
}

const PHOTO_PREFIX = 'photos';

/** Server-owned key for a profile/portfolio photo, scoped to the usher. */
export function photoKey(usherId: string, kind: 'avatar' | 'portfolio', ext: string): string {
  return `${PHOTO_PREFIX}/${usherId}/${kind}-${randomUUID()}.${ext}`;
}

/** A submitted photo key is only valid if it lives under the caller's own prefix. */
export function ownsPhotoKey(usherId: string, key: string): boolean {
  return key.startsWith(`${PHOTO_PREFIX}/${usherId}/`);
}

/** Resolve a stored key to a short-lived GET URL; pass through when storage is
 * disabled (legacy URL value) or the value is empty (erased document). */
export async function presignDoc(storage: StoragePort | undefined, value: string): Promise<string> {
  if (!storage || !value) return value;
  return storage.presignDownload(value);
}
