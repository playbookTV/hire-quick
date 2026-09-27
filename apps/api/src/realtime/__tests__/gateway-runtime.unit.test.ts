/** Real local Socket.IO/Redis transport; authorization/message DB ports are mocked. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as netServer, type AddressInfo } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once as nodeOnce } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { Redis } from 'ioredis';
import { createSocketGateway, createEmitterGateway, type SocketGateway } from '../gateway.js';
import { RT } from '../events.js';
import { SOCKET_RATE_LIMIT } from '../rate-limit.js';

const state = vi.hoisted(() => ({
  principals: new Map<string, { userId: string; role: 'CLIENT' | 'USHER' | 'ADMIN'; refreshJti: string; expiresAt: number }>(),
  members: new Map<string, string[]>(),
  send: vi.fn(),
}));
vi.mock('../../app.js', () => ({ ApiError: class extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
} }));
vi.mock('../socket-auth.js', () => ({ authorizeSocketToken: async (token: string) => {
  const value = state.principals.get(token);
  if (!value || value.expiresAt <= Date.now()) throw new Error('database-secret-must-not-leak');
  return value;
} }));
vi.mock('../messages.js', () => {
  const assert = async (bookingId: string, userId: string) => {
    if (!state.members.get(bookingId)?.includes(userId)) throw new Error('database-secret-must-not-leak');
  };
  return { assertParty: assert, assertMessageableParty: assert, sendMessage: state.send, markSeen: async () => 1 };
});

const gateways: SocketGateway[] = [];
const sockets: ClientSocket[] = [];
const emitters: Array<ReturnType<typeof createEmitterGateway>> = [];
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, message: string) {
  const end = Date.now() + 10_000;
  while (Date.now() < end) { if (await check()) return; await delay(20); }
  throw new Error(message);
}
function token(userId = randomUUID(), role: 'CLIENT' | 'USHER' | 'ADMIN' = 'CLIENT') {
  const value = randomUUID();
  state.principals.set(value, { userId, role, refreshJti: randomUUID(), expiresAt: Date.now() + 60_000 });
  return value;
}
async function start(redisUrl?: string) {
  const gateway = createSocketGateway(redisUrl ? { redisUrl } : {});
  const server = createServer(); gateway.attach(server); gateways.push(gateway);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  await until(gateway.ready, 'gateway readiness timeout');
  return { gateway, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
async function connect(url: string, access: string) {
  const socket = ioClient(url, { transports: ['websocket'], auth: { token: access }, reconnection: false });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}
function event<T>(socket: ClientSocket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`event timeout: ${name}`)), 5000);
    socket.once(name, (value: T) => { clearTimeout(timer); resolve(value); });
  });
}
function ack(socket: ClientSocket, name: string, payload: unknown): Promise<{ ok: boolean; code?: string; error?: string }> {
  return new Promise((resolve, reject) => socket.timeout(5000).emit(name, payload, (error: Error | null, value: { ok: boolean; code?: string; error?: string }) => error ? reject(error) : resolve(value)));
}
beforeEach(() => { state.principals.clear(); state.members.clear(); state.send.mockReset(); });
async function closeTransports() {
  for (const socket of sockets.splice(0)) socket.close();
  for (const emitter of emitters.splice(0)) emitter.close();
  for (const gateway of gateways.splice(0)) await gateway.io?.close();
}
afterEach(closeTransports);

describe('bounded local socket runtime', () => {
  it('rejects malformed input and hides internal exception messages', async () => {
    const node = await start(); const userId = randomUUID(); const bookingId = randomUUID();
    state.members.set(bookingId, [userId]);
    const socket = await connect(node.url, token(userId));
    for (const payload of [null, {}, { bookingId, content: 'x'.repeat(4001) }, { bookingId, content: 'x', contentType: 'HTML' }])
      expect(await ack(socket, 'message:send', payload)).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(state.send).not.toHaveBeenCalled();
    state.send.mockRejectedValueOnce(new Error('database-secret-must-not-leak'));
    const response = await ack(socket, 'message:send', { bookingId, content: 'valid' });
    expect(response).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    expect(JSON.stringify(response)).not.toContain('database-secret');
  });
  it('counts malformed traffic and preserves per-user rate limits across reconnects', async () => {
    const node = await start(); const userId = randomUUID();
    const socket = await connect(node.url, token(userId));
    for (let i = 0; i < SOCKET_RATE_LIMIT; i++) expect((await ack(socket, 'room:join', null)).code).toBe('VALIDATION');
    expect((await ack(socket, 'typing:start', null)).code).toBe('RATE_LIMITED');
    socket.close();
    const next = await connect(node.url, token(userId));
    expect((await ack(next, 'message:send', null)).code).toBe('RATE_LIMITED');
    expect(state.send).not.toHaveBeenCalled();
  });
  it('disconnects oversized wire packets before a message write', async () => {
    const node = await start(); const socket = await connect(node.url, token());
    const disconnected = event(socket, 'disconnect');
    socket.emit('message:send', { bookingId: randomUUID(), content: 'x'.repeat(50_000) });
    await disconnected;
    expect(state.send).not.toHaveBeenCalled();
  });
});

const hasRedis = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
describe.skipIf(!hasRedis)('actual isolated Redis fanout with mocked DB ports', () => {
  let directory: string;
  let child: ChildProcess | undefined;
  let redisUrl: string;
  let probe: Redis;
  let config: string;
  async function boot() {
    child = spawn('redis-server', [config], { stdio: 'ignore' });
    await until(() => probe.status === 'ready', 'isolated Redis readiness timeout');
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = nodeOnce(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hq-socket-redis-'));
    const reservation = netServer();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const password = randomUUID();
    config = join(directory, 'redis.conf');
    await writeFile(config, `bind 127.0.0.1\nport ${port}\nrequirepass ${password}\nsave ""\nappendonly no\ndir ${directory}\n`, { mode: 0o600 });
    redisUrl = `redis://:${password}@127.0.0.1:${port}/13`;
    probe = new Redis(redisUrl, { retryStrategy: () => 20, maxRetriesPerRequest: null });
    probe.on('error', () => {});
    await boot();
  });
  afterAll(async () => {
    probe?.disconnect(); await stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  afterEach(async () => {
    // Explicit cleanup is independent of nested-hook execution order.
    await closeTransports();
    await until(async () => {
      const clients = await probe.call('CLIENT', 'LIST');
      return typeof clients === 'string' && clients.trim().split('\n').length === 1;
    }, 'Redis client cleanup timeout');
  });
  it('guards worker user/booking/admin fanout, isolates logical DBs and delivers exactly once', async () => {
    const a = await start(redisUrl); const b = await start(redisUrl);
    const userId = randomUUID(); const usherId = randomUUID(); const adminId = randomUUID(); const bookingId = randomUUID();
    state.members.set(bookingId, [userId, usherId]);
    const owner = await connect(a.url, token(userId)); const usher = await connect(b.url, token(usherId, 'USHER')); const admin = await connect(b.url, token(adminId, 'ADMIN'));
    await ack(owner, 'room:join', { bookingId }); await ack(usher, 'room:join', { bookingId });
    const worker = createEmitterGateway(redisUrl); emitters.push(worker); await until(worker.ready, 'worker emitter readiness timeout');
    const ownerMessages: unknown[] = []; const usherMessages: unknown[] = [];
    owner.on(RT.MESSAGE_NEW, (value: unknown) => ownerMessages.push(value)); usher.on(RT.MESSAGE_NEW, (value: unknown) => usherMessages.push(value));
    const first = event(owner, RT.MESSAGE_NEW); const second = event(usher, RT.MESSAGE_NEW);
    worker.emitToBooking(bookingId, RT.MESSAGE_NEW, { bookingId, content: 'one' });
    await Promise.all([first, second]);
    const adminOnly: unknown[] = []; owner.on('private.admin', (value: unknown) => adminOnly.push(value));
    const adminResult = event(admin, 'private.admin'); worker.emitToAdmins('private.admin', { private: true }); await adminResult;
    const wrongDb = createEmitterGateway(redisUrl.replace('/13', '/14')); emitters.push(wrongDb); await until(wrongDb.ready, 'second DB emitter readiness timeout');
    wrongDb.emitToBooking(bookingId, RT.MESSAGE_NEW, { bookingId, content: 'wrong DB' });
    const markA = event(owner, 'private.marker'); const markB = event(usher, 'private.marker');
    worker.emitToUser(userId, 'private.marker', { own: true }); worker.emitToUser(usherId, 'private.marker', { own: true });
    await Promise.all([markA, markB]);
    expect(ownerMessages).toEqual([{ bookingId, content: 'one' }]); expect(usherMessages).toEqual(ownerMessages); expect(adminOnly).toEqual([]);
  });
  it('fails incoming actions closed when only the subscriber loses authorization', async () => {
    const node = await start(redisUrl); const userId = randomUUID(); const bookingId = randomUUID();
    state.members.set(bookingId, [userId]);
    const socket = await connect(node.url, token(userId));
    const worker = createEmitterGateway(redisUrl); emitters.push(worker); await until(worker.ready, 'worker readiness timeout');
    try {
      await probe.call('ACL', 'SETUSER', 'default', '-subscribe');
      await probe.call('CLIENT', 'KILL', 'TYPE', 'pubsub');
      await until(() => !node.gateway.ready(), 'subscriber failure not observed');
      expect(worker.ready()).toBe(true); // Publisher and rate-limit connection remain healthy.
      expect(await ack(socket, 'room:join', { bookingId })).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    } finally {
      await probe.call('ACL', 'SETUSER', 'default', '+subscribe');
    }
    expect(state.send).not.toHaveBeenCalled();
  });
  it('drops outage traffic without replay/local bypass and resumes guarded delivery once', async () => {
    const node = await start(redisUrl); const userId = randomUUID(); const socket = await connect(node.url, token(userId));
    const worker = createEmitterGateway(redisUrl); emitters.push(worker); await until(worker.ready, 'worker readiness timeout');
    const received: unknown[] = []; socket.on('private.outage', (value: unknown) => received.push(value));
    await stop(); await until(() => !node.gateway.ready() && !worker.ready(), 'Redis outage not observed');
    node.gateway.emitToUser(userId, 'private.outage', { value: 'local bypass' }); worker.emitToUser(userId, 'private.outage', { value: 'buffered outage' });
    expect((await ack(socket, 'room:join', { bookingId: randomUUID() })).ok).toBe(false);
    await boot(); await until(() => node.gateway.ready() && worker.ready(), 'Redis reconnect timeout');
    const recovered = event(socket, 'private.outage'); node.gateway.emitToUser(userId, 'private.outage', { value: 'recovered' }); await recovered;
    const marker = event(socket, 'private.marker'); worker.emitToUser(userId, 'private.marker', { done: true }); await marker;
    expect(received).toEqual([{ value: 'recovered' }]);
  });
});
