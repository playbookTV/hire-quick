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

it('binds upload length and uses the inspected ETag for ranged reads and copies', async () => {
  const requests: { method: string; range?: string; match?: string; sourceMatch?: string }[] = [];
  server = createServer((req, res) => {
    requests.push({
      method: req.method!,
      ...(req.headers.range ? { range: req.headers.range } : {}),
      ...(req.headers['if-match'] ? { match: String(req.headers['if-match']) } : {}),
      ...(req.headers['x-amz-copy-source-if-match']
        ? { sourceMatch: String(req.headers['x-amz-copy-source-if-match']) }
        : {}),
    });
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'content-length': '16',
        'content-type': 'image/jpeg',
        etag: '"version-one"',
      });
      res.end();
    } else if (req.method === 'GET') {
      res.writeHead(206, { 'content-length': '4', 'content-type': 'image/jpeg' });
      res.end(Buffer.from([255, 216, 255, 0]));
    } else {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(
        '<CopyObjectResult><ETag>"version-one"</ETag><LastModified>2026-09-22T00:00:00Z</LastModified></CopyObjectResult>',
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback address');
  const storage = createS3Storage({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'auto',
    bucket: 'test',
    accessKey: 'test',
    secretKey: 'test',
  });
  const url = new URL(await storage.presignUpload('staging/test', 'image/jpeg', 16));
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  const inspected = await storage.inspectObject('staging/test');
  expect(inspected.size).toBe(16);
  expect(inspected.prefix).toEqual(new Uint8Array([255, 216, 255, 0]));
  await storage.copyObject('staging/test', 'saved/test', inspected.etag, 'image/jpeg');
  expect(requests).toEqual([
    { method: 'HEAD' },
    { method: 'GET', range: 'bytes=0-511', match: '"version-one"' },
    { method: 'PUT', sourceMatch: '"version-one"' },
  ]);
});
