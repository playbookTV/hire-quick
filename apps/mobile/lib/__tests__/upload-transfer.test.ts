import { describe, expect, it, vi } from 'vitest';
// Exercise the installed SDK's real request normalization: Node fetch alone
// does not reproduce Expo replacing Content-Type with the Blob's type.
import {
  normalizeBodyInitAsync,
  normalizeHeadersInit,
  overrideHeaders,
} from '../../node_modules/expo/src/winter/fetch/RequestUtils';
import { transferUpload } from '../upload-transfer.js';

describe('signed uploads through Expo fetch', () => {
  it.each(['', 'application/octet-stream', 'image/png', 'image/jpeg'])(
    'preserves the signed MIME type and bytes when the local response type is %j',
    async (localType) => {
      const bytes = new Uint8Array([255, 216, 255, 0, 128, 42]);
      const post = vi.fn((path: string) =>
        Promise.resolve(
          path.endsWith('/finalize')
            ? { key: 'verified' }
            : { key: 'issued', url: 'https://storage.invalid/put' },
        ),
      );
      let receivedBytes: Uint8Array | null = null;
      let receivedType: string | null = null;
      const transport = vi.fn<typeof fetch>(async (_url, options) => {
        if (options?.method !== 'PUT') {
          return new Response(new Blob([bytes], { type: localType }));
        }
        const normalized = await normalizeBodyInitAsync(options.body);
        const headers = normalizeHeadersInit(options.headers);
        const sentHeaders = normalized.overriddenHeaders
          ? overrideHeaders(headers, normalized.overriddenHeaders)
          : headers;
        receivedType = new Headers(sentHeaders).get('content-type');
        receivedBytes = normalized.body;
        // A presigned PUT must send exactly the content type it was signed for.
        return new Response(null, { status: receivedType === 'image/jpeg' ? 200 : 403 });
      });

      await expect(
        transferUpload(
          '/api/me/photos/upload-url',
          { kind: 'avatar', contentType: 'image/jpeg' },
          'image/jpeg',
          { uri: 'file:///photo.jpg', fileSize: bytes.length },
          post as Parameters<typeof transferUpload>[4],
          transport,
        ),
      ).resolves.toBe('verified');
      expect(receivedType).toBe('image/jpeg');
      expect(receivedBytes).toEqual(bytes);
      const signal = transport.mock.calls[0]?.[1]?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(post).toHaveBeenNthCalledWith(
        1,
        '/api/me/photos/upload-url',
        { kind: 'avatar', contentType: 'image/jpeg', byteSize: bytes.length },
        { signal },
      );
      expect(post).toHaveBeenNthCalledWith(
        2,
        '/api/me/uploads/finalize',
        { key: 'issued' },
        { signal },
      );
    },
  );

  it('reuses the file buffer through Expo without a Blob conversion or another byte copy', async () => {
    const buffer = new Uint8Array(1024 * 1024).fill(173).buffer;
    const file = new Response();
    const readBuffer = vi.spyOn(file, 'arrayBuffer').mockResolvedValue(buffer);
    const readBlob = vi.spyOn(file, 'blob');
    const post = vi.fn((path: string) =>
      Promise.resolve(
        path.endsWith('/finalize')
          ? { key: 'verified' }
          : { key: 'issued', url: 'https://storage.invalid/put' },
      ),
    );
    const transport = vi.fn<typeof fetch>(async (_url, options) => {
      if (options?.method !== 'PUT') return file;
      const normalized = await normalizeBodyInitAsync(options.body);
      expect(normalized.body?.buffer).toBe(buffer);
      expect(normalized.overriddenHeaders).toBeUndefined();
      return new Response();
    });
    await expect(
      transferUpload(
        '/upload',
        {},
        'image/jpeg',
        { uri: 'file:///photo.jpg' },
        post as Parameters<typeof transferUpload>[4],
        transport,
      ),
    ).resolves.toBe('verified');
    expect(readBuffer).toHaveBeenCalledTimes(1);
    expect(readBlob).not.toHaveBeenCalled();
  });

  it.each([0, 10 * 1024 * 1024 + 1])(
    'rejects an actual file size of %i before requesting a URL',
    async (size) => {
      const post = vi.fn();
      const transport = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(new Uint8Array(size))),
      );
      await expect(
        transferUpload('/upload', {}, 'image/jpeg', { uri: 'file:///photo.jpg' }, post, transport),
      ).rejects.toThrow('smaller than 10 MB');
      expect(post).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});
