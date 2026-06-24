/**
 * KYC document upload (TRD §14). Two-step, server-issued presigned flow:
 *   1. POST /api/me/verification/upload-url → { url, key } (server-owned key)
 *   2. PUT the file bytes straight to object storage (R2) at that URL
 * The API never sees the bytes; we then submit the returned `key` to
 * POST /api/me/verification. Native uploads aren't subject to browser CORS.
 */
import * as ImagePicker from 'expo-image-picker';
import { api } from './client.js';

export type DocKind = 'id' | 'selfie';
export type PickSource = 'library' | 'camera';

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

/** PUT the picked bytes straight to storage at the presigned URL. */
async function putBytes(url: string, contentType: string, asset: PickedAsset): Promise<void> {
  const fileRes = await fetch(asset.uri);
  const blob = await fileRes.blob();
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
}

/**
 * Two-step presigned upload: ask `path` for a presigned PUT URL + server-owned
 * key, PUT the bytes straight to storage, return the key. Shared by KYC docs and
 * profile/portfolio photos — they differ only in the endpoint and `kind`.
 */
async function presignAndPut(path: string, kind: string, asset: PickedAsset): Promise<string> {
  const contentType = asset.mimeType ?? 'image/jpeg';
  const ext = extFor(asset, contentType);
  const { url, key } = await api.post<{ url: string; key: string }>(path, { kind, contentType, ext });
  await putBytes(url, contentType, asset);
  return key;
}

/** Presign, PUT the bytes to storage, and return the server-owned object key. */
export async function uploadVerificationDoc(kind: DocKind, asset: PickedAsset): Promise<string> {
  return presignAndPut('/api/me/verification/upload-url', kind, asset);
}

/**
 * Request permission and launch the picker. Returns the picked asset, or null
 * if the user cancelled. Throws a friendly message when permission is denied.
 */
export async function pickImageAsset(source: PickSource): Promise<PickedAsset | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      source === 'camera'
        ? 'Camera access is off. Allow it in Settings to take a photo.'
        : 'Photo access is off. Allow it in Settings to choose a photo.',
    );
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName };
}

export type PhotoKind = 'avatar' | 'portfolio';

/**
 * Upload a profile or portfolio photo and return the server-owned key. Same
 * presigned-PUT flow as KYC; the API never sees the bytes.
 */
export async function uploadUsherPhoto(kind: PhotoKind, asset: PickedAsset): Promise<string> {
  return presignAndPut('/api/me/photos/upload-url', kind, asset);
}
