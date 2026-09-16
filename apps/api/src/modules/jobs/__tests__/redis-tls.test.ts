/** Real loopback TLS Redis, never the configured REDIS_URL or application database. */
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Redis } from 'ioredis';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redisConnection } from '../redis.js';

const available =
  spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0;
let folder: string | undefined;
let processHandle: ChildProcess | undefined;
let queue: Queue | undefined;
let queueEvents: QueueEvents | undefined;
let worker: Worker | undefined;
const clients: Redis[] = [];
const username = 'worker@hq:validation';
const password = `test:${randomUUID()}/@?#%`;
let redisUrl: string;
let ca: Buffer;

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable Redis port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

beforeAll(async () => {
  if (!available) return;
  folder = await mkdtemp(join(tmpdir(), 'hq-redis-tls-'));
  const caConfig = join(folder, 'ca.conf');
  const serverConfig = join(folder, 'server.conf');
  await writeFile(
    caConfig,
    '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=HireQuick disposable Redis CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n',
  );
  await writeFile(
    serverConfig,
    '[req]\nprompt=no\ndistinguished_name=dn\n[dn]\nCN=localhost\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n',
  );
  const caKey = join(folder, 'ca.key');
  const caCert = join(folder, 'ca.crt');
  const serverKey = join(folder, 'server.key');
  const serverCsr = join(folder, 'server.csr');
  const serverCert = join(folder, 'server.crt');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      caKey,
      '-out',
      caCert,
      '-days',
      '1',
      '-config',
      caConfig,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      serverKey,
      '-out',
      serverCsr,
      '-config',
      serverConfig,
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'x509',
      '-req',
      '-in',
      serverCsr,
      '-CA',
      caCert,
      '-CAkey',
      caKey,
      '-CAcreateserial',
      '-out',
      serverCert,
      '-days',
      '1',
      '-extfile',
      serverConfig,
      '-extensions',
      'server',
    ],
    { stdio: 'ignore' },
  );
  const port = await unusedPort();
  const aclFile = join(folder, 'users.acl');
  await writeFile(
    aclFile,
    `user default off\nuser ${username} on #${createHash('sha256').update(password).digest('hex')} ~* &* +@all\n`,
    { mode: 0o600 },
  );
  const configPath = join(folder, 'redis.conf');
  await writeFile(
    configPath,
    [
      'bind 127.0.0.1',
      'protected-mode yes',
      'port 0',
      `tls-port ${port}`,
      `tls-cert-file ${JSON.stringify(serverCert)}`,
      `tls-key-file ${JSON.stringify(serverKey)}`,
      `tls-ca-cert-file ${JSON.stringify(caCert)}`,
      'tls-auth-clients no',
      `aclfile ${JSON.stringify(aclFile)}`,
      `dir ${JSON.stringify(folder)}`,
      'save ""',
      'appendonly no',
      'daemonize no',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  processHandle = spawn('redis-server', [configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Disposable TLS Redis startup timed out')),
      10_000,
    );
    let output = '';
    processHandle!.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('Ready to accept connections')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    processHandle!.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    processHandle!.once('error', () => {
      clearTimeout(timeout);
      reject(new Error('Disposable Redis executable failed'));
    });
    processHandle!.once('exit', () => {
      clearTimeout(timeout);
      const diagnostic = output
        .replaceAll(password, '[test-password]')
        .replaceAll(username, '[test-user]');
      reject(new Error(`Disposable TLS Redis exited during startup: ${diagnostic}`));
    });
  });
  redisUrl = `rediss://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/5`;
  ca = await readFile(caCert);
}, 30_000);

afterAll(async () => {
  await worker?.close(true);
  await queueEvents?.close();
  await queue?.close();
  for (const client of clients) client.disconnect();
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    const exited = once(processHandle, 'exit');
    processHandle.kill('SIGTERM');
    const force = setTimeout(() => processHandle?.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(force);
  }
  if (folder) await rm(folder, { recursive: true, force: true });
});

describe.skipIf(!available)('BullMQ over disposable authenticated TLS Redis', () => {
  it('processes a job in the requested nonzero DB with decoded ACL auth and verified TLS', async () => {
    const parsed = redisConnection(redisUrl);
    const connection = {
      ...parsed,
      ...(parsed.tls ? { tls: { ...parsed.tls, ca } } : {}),
      retryStrategy: () => null,
      connectTimeout: 1500,
    };
    const untrusted = new Redis({
      ...parsed,
      lazyConnect: true,
      retryStrategy: () => null,
      connectTimeout: 1000,
    });
    clients.push(untrusted);
    const untrustedErrors: Error[] = [];
    untrusted.on('error', (error) => untrustedErrors.push(error));
    await expect(untrusted.connect()).rejects.toThrow();
    expect(
      untrustedErrors.some((error) => /certificate|issuer|self.signed/i.test(error.message)),
    ).toBe(true);
    const denied = new Redis({ ...connection, password: 'deliberately-wrong', lazyConnect: true });
    clients.push(denied);
    const deniedErrors: Error[] = [];
    denied.on('error', (error) => deniedErrors.push(error));
    await expect(denied.connect()).rejects.toThrow();
    expect(
      deniedErrors.some((error) => /WRONGPASS|invalid username-password/i.test(error.message)),
    ).toBe(true);

    const queueName = `hq-redis-validation-${randomUUID()}`;
    queue = new Queue(queueName, { connection });
    queueEvents = new QueueEvents(queueName, { connection });
    worker = new Worker(queueName, async (job) => Number(job.data.value) * 2, { connection });
    const connectionErrors: Error[] = [];
    queue.on('error', (error: Error) => connectionErrors.push(error));
    queueEvents.on('error', (error: Error) => connectionErrors.push(error));
    worker.on('error', (error: Error) => connectionErrors.push(error));
    await Promise.all([
      queue.waitUntilReady(),
      queueEvents.waitUntilReady(),
      worker.waitUntilReady(),
    ]);
    const job = await queue.add('double', { value: 21 });
    expect(await job.waitUntilFinished(queueEvents, 10_000)).toBe(42);
    expect(await job.getState()).toBe('completed');

    const db0 = new Redis({ ...connection, db: 0 });
    const db5 = new Redis(connection);
    clients.push(db0, db5);
    expect(await db5.call('ACL', 'WHOAMI')).toBe(username);
    expect(await db0.keys(`bull:${queueName}:*`)).toEqual([]);
    expect((await db5.keys(`bull:${queueName}:*`)).length).toBeGreaterThan(0);
    expect(connectionErrors).toEqual([]);
  }, 25_000);
});
