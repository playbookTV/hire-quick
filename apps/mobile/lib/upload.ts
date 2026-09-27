/**
 * KYC document upload (TRD §14). Verified, server-issued presigned flow:
 *   1. POST /api/me/verification/upload-url → { url, key } (server-owned key)
 *   2. PUT the file bytes straight to object storage (R2) at that URL
 *   3. POST /api/me/uploads/finalize checks the uploaded file and copies it to a saved key.
 * Submit that verified key to the profile or message endpoint. Native uploads aren't subject to browser CORS.
 */
import * as ImagePicker from 'expo-image-picker';
import { api } from './client.js';
import { transferUpload } from './upload-transfer.js';

export type DocKind = 'id' | 'selfie';
export type PickSource = 'library' | 'camera';

export interface PickedAsset {
  uri: string;
  fileSize?: number | undefined;
  mimeType?: string | undefined;
  fileName?: string | null | undefined;
}

async function presignAndPut(path: string, kind: string, asset: PickedAsset): Promise<string> {
  const contentType = asset.mimeType ?? 'image/jpeg';
  return transferUpload(path, { kind, contentType }, contentType, asset, api.post);
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
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
  };
}

/**
 * Multi-select from the photo library. Returns up to `limit` picked assets, or []
 * if cancelled. Used by the portfolio editor so an usher can add several work
 * photos in one go (feedback: "can we select multiple at a time").
 */
export async function pickImageAssets(limit: number): Promise<PickedAsset[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo access is off. Allow it in Settings to choose photos.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, limit),
  });
  if (result.canceled) return [];
  return result.assets.map((a) => ({
    uri: a.uri,
    mimeType: a.mimeType,
    fileName: a.fileName,
    fileSize: a.fileSize,
  }));
}

export type PhotoKind = 'avatar' | 'portfolio';

/**
 * Upload a profile or portfolio photo and return the server-owned key. Same
 * presigned-PUT flow as KYC; the API never sees the bytes.
 */
export async function uploadUsherPhoto(kind: PhotoKind, asset: PickedAsset): Promise<string> {
  return presignAndPut('/api/me/photos/upload-url', kind, asset);
}

export async function uploadChatPhoto(bookingId: string, asset: PickedAsset): Promise<string> {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType))
    throw new Error('Choose a JPEG, PNG or WebP photo.');
  return transferUpload(
    `/api/bookings/${bookingId}/media/upload-url`,
    { contentType: 'IMAGE', mimeType },
    mimeType,
    asset,
    api.post,
  );
}
