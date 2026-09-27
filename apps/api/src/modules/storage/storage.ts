/**
 * S3-compatible object storage for KYC documents (TRD §14). Provider-agnostic:
 * works with AWS S3, Cloudflare R2, or Backblaze B2 by setting STORAGE_ENDPOINT
 * (empty = AWS default). Server mints short-lived presigned URLs so clients
 * upload/read directly. Finalization inspects a bounded signature and copies
 * verified bytes to a server-owned key the caller cannot overwrite.
 */
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoragePort {
  presignUpload(key: string, contentType: string, byteSize?: number): Promise<string>;
  presignDownload(key: string, expiresInSec?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  inspectObject(
    key: string,
  ): Promise<{ size: number; contentType: string; etag: string; prefix: Uint8Array }>;
  copyObject(source: string, destination: string, etag: string, contentType: string): Promise<void>;
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
  // Some existing R2 configurations use the dashboard's bucket URL instead of
  // the account endpoint. With path-style addressing this has always stored
  // objects under <bucket>/<key> within that bucket. Preserve those addresses
  // (including old saved files) and use the same physical path for server copies.
  const endpoint = cfg.endpoint ? new URL(cfg.endpoint) : undefined;
  const bucketEndpoint =
    endpoint?.hostname.endsWith('.r2.cloudflarestorage.com') &&
    decodeURIComponent(endpoint.pathname).replace(/\/+$/, '') === `/${cfg.bucket}`;
  const copySourcePrefix = bucketEndpoint ? `${cfg.bucket}/${cfg.bucket}` : cfg.bucket;
  const client = new S3Client({
    region: cfg.region,
    // Custom endpoint (R2/B2/minio) needs path-style addressing.
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // Deletes are idempotent; allow one SDK retry inside the total deadline.
    maxAttempts: 2,
    // Presigning has no body to checksum; never sign an empty-body checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return {
    presignUpload: (key, contentType, byteSize) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          ContentType: contentType,
          ...(byteSize === undefined ? {} : { ContentLength: byteSize }),
        }),
        {
          expiresIn: 300,
          signableHeaders: new Set(['content-type']),
        },
      ),
    presignDownload: (key, expiresInSec = 300) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        expiresIn: expiresInSec,
      }),
    deleteObject: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(cfg.requestTimeoutMs ?? 15_000),
      });
    },
    inspectObject: async (key) => {
      const options = { abortSignal: AbortSignal.timeout(cfg.requestTimeoutMs ?? 15_000) };
      const head = await client.send(
        new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        options,
      );
      if (!head.ETag || head.ContentLength === undefined)
        throw new Error('Missing object metadata');
      const object = await client.send(
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Range: 'bytes=0-511',
          IfMatch: head.ETag,
        }),
        options,
      );
      if (!object.Body || object.ContentLength === undefined || object.ContentLength > 512) {
        if (object.Body && 'destroy' in object.Body) object.Body.destroy();
        throw new Error('Object store did not return a bounded range');
      }
      return {
        size: head.ContentLength,
        contentType: head.ContentType ?? '',
        etag: head.ETag,
        prefix: await object.Body.transformToByteArray(),
      };
    },
    copyObject: async (source, destination, etag, contentType) => {
      await client.send(
        new CopyObjectCommand({
          Bucket: cfg.bucket,
          Key: destination,
          CopySource: `${copySourcePrefix}/${source.split('/').map(encodeURIComponent).join('/')}`,
          CopySourceIfMatch: etag,
          MetadataDirective: 'REPLACE',
          ContentType: contentType,
          CacheControl: 'private, no-store',
          ...(contentType === 'application/pdf' ? { ContentDisposition: 'attachment' } : {}),
        }),
        { abortSignal: AbortSignal.timeout(cfg.requestTimeoutMs ?? 15_000) },
      );
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
