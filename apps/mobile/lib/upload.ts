/**
 * KYC document upload (TRD §14). Two-step, server-issued presigned flow:
 *   1. POST /api/me/verification/upload-url → { url, key } (server-owned key)
 *   2. PUT the file bytes straight to object storage (R2) at that URL
 * The API never sees the bytes; we then submit the returned `key` to
 * POST /api/me/verification. Native uploads aren't subject to browser CORS.
 */
import { api } from './client.js';

export type DocKind = 'id' | 'selfie';

export interface PickedAsset {
  uri: string;
  mimeType?: string | undefined;
  fileName?: string | null | undefined;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function extFor(asset: PickedAsset, contentType: string): string {
  const fromName = asset.fileName?.split('.').pop();
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  return EXT_BY_TYPE[contentType] ?? 'jpg';
}

/** Presign, PUT the bytes to storage, and return the server-owned object key. */
export async function uploadVerificationDoc(kind: DocKind, asset: PickedAsset): Promise<string> {
  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = extFor(asset, contentType);

  const { url, key } = await api.post<{ url: string; key: string }>('/api/me/verification/upload-url', {
    kind,
    contentType,
    ext,
  });

  // Read the local file into a blob, then PUT it with the exact signed type.
  const fileRes = await fetch(asset.uri);
  const blob = await fileRes.blob();
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  return key;
}
