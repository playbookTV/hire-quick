/** Portable transport for the picker flow. A key is usable only after finalization. */
export async function transferUpload(
  path: string,
  body: Record<string, string>,
  contentType: string,
  asset: { uri: string; fileSize?: number | undefined },
  post: <T>(path: string, body: unknown, options: { signal: AbortSignal }) => Promise<T>,
  transport: typeof fetch = fetch,
): Promise<string> {
  const maxBytes = 10 * 1024 * 1024;
  if (asset.fileSize !== undefined && (asset.fileSize <= 0 || asset.fileSize > maxBytes))
    throw new Error('Choose a file smaller than 10 MB.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const file = await transport(asset.uri, { signal: controller.signal });
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxBytes)
      throw new Error('Choose a file smaller than 10 MB.');
    const options = { signal: controller.signal };
    const { url, key } = await post<{ url: string; key: string }>(
      path,
      { ...body, byteSize: bytes.byteLength },
      options,
    );
    const put = await transport(url, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      // Expo passes this buffer through without the native Blob/base64 round trip
      // and preserves the explicit signed Content-Type (Blob bodies override it).
      body: bytes,
      signal: controller.signal,
    });
    if (!put.ok) throw new Error('Upload failed. Please try again.');
    const verified = await post<{ key: string }>('/api/me/uploads/finalize', { key }, options);
    return verified.key;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Upload took too long. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
