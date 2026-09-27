import { S3Client, type CopyObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createS3Storage } from '../storage.js';

afterEach(() => vi.restoreAllMocks());
describe('R2 copy source addresses', () => {
  it.each(['', '/test', '/test/'])(
    'copies from the same physical path as the signed PUT for endpoint suffix %s',
    async (suffix) => {
      const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue(undefined);
      const storage = createS3Storage({
        endpoint: `https://account.r2.cloudflarestorage.com${suffix}`,
        region: 'auto',
        bucket: 'test',
        accessKey: 'test',
        secretKey: 'test',
      });
      const source = 'staging/photos/test/file name.png';
      const url = new URL(await storage.presignUpload(source, 'image/png', 16));
      await storage.copyObject(source, 'photos/test/final.png', '"etag"', 'image/png');
      const command = send.mock.calls[0]![0] as CopyObjectCommand;
      expect(command.input.CopySource).toBe(url.pathname.slice(1));
      expect(command.input.CopySourceIfMatch).toBe('"etag"');
      expect(command.input.Key).toBe('photos/test/final.png');
      expect(new URL(await storage.presignDownload(source)).pathname).toBe(url.pathname);
    },
  );
});
