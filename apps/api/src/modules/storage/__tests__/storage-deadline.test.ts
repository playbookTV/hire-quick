import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createS3Storage } from '../storage.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server!.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

describe('storage provider deadlines', () => {
  it('aborts a stalled deletion without reporting success', async () => {
    let requests = 0;
    server = createServer(() => {
      requests += 1;
    }); // Deliberately never send headers.
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback address');
    const storage = createS3Storage({
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'test',
      accessKey: 'isolated-test',
      secretKey: 'isolated-test',
      requestTimeoutMs: 500,
    });
    const started = Date.now();
    await expect(storage.deleteObject('test-object')).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toBe(1);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
