import { afterEach, describe, expect, it, vi } from 'vitest';
import { transferUpload } from '../../../../../mobile/lib/upload-transfer.js';

afterEach(() => vi.useRealTimers());
function fixture() {
  const transport = vi.fn<typeof fetch>(async (_url, options) =>
    options?.method === 'PUT'
      ? new Response(null, { status: 200 })
      : new Response(new Blob(['data'])),
  );
  const post = vi.fn(
    async (path: string): Promise<unknown> =>
      path.endsWith('finalize')
        ? { key: 'verified' }
        : { key: 'issued', url: 'https://storage.invalid/put' },
  );
  const run = (fileSize?: number) =>
    transferUpload(
      '/upload-url',
      { kind: 'avatar', contentType: 'image/jpeg' },
      'image/jpeg',
      { uri: 'file:///photo.jpg', fileSize },
      post as Parameters<typeof transferUpload>[4],
      transport,
    );
  return { transport, post, run };
}
describe('mobile verified upload transfer', () => {
  it('sends exact bytes and returns only the finalized key', async () => {
    const f = fixture();
    expect(await f.run()).toBe('verified');
    expect(f.post.mock.calls[0]).toEqual([
      '/upload-url',
      { kind: 'avatar', contentType: 'image/jpeg', byteSize: 4 },
      { signal: expect.any(AbortSignal) },
    ]);
    expect(f.post.mock.calls[1]).toEqual([
      '/api/me/uploads/finalize',
      { key: 'issued' },
      { signal: expect.any(AbortSignal) },
    ]);
    expect(f.transport.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
    });
  });
  it('does not finalize a failed PUT', async () => {
    const f = fixture();
    f.transport
      .mockResolvedValueOnce(new Response('data'))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(f.run()).rejects.toThrow('Upload failed');
    expect(f.post).toHaveBeenCalledTimes(1);
  });
  it('does not return an unverified reference when finalization fails', async () => {
    const f = fixture();
    f.post
      .mockResolvedValueOnce({ key: 'issued', url: 'https://storage.invalid/put' })
      .mockRejectedValueOnce(new Error('incomplete'));
    await expect(f.run()).rejects.toThrow('incomplete');
  });
  it('rejects oversized picker assets before reading or signing', async () => {
    const f = fixture();
    await expect(f.run(11 * 1024 * 1024)).rejects.toThrow('10 MB');
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
  });
  it('aborts a stalled transfer with a retryable error', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.transport.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const pending = expect(f.run()).rejects.toThrow('Upload took too long');
    await vi.advanceTimersByTimeAsync(120_000);
    await pending;
  });
});
