import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { createSocketGateway, type SocketGateway } from '../gateway.js';
import { signAccessToken } from '../../modules/auth/tokens.js';
import { holdOrder } from '../../modules/payments/ledger/ledger.js';
import { InMemoryPaystack } from '../../modules/payments/port/paystack-port.js';
import { createScenario, teardown, type Scenario } from '../../modules/payments/__tests__/fixtures.js';

// No redisUrl → in-memory adapter, so the test needs no Redis.
const gateway: SocketGateway = createSocketGateway();
const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x', realtime: gateway });
let server: HttpServer;
let port: number;
const createdUserIds: string[] = [];

/** Persist an ACTIVE user so the gateway's auth status check admits the socket. */
async function activeUserId(role: 'USHER' | 'ADMIN' | 'CLIENT'): Promise<string> {
  const u = await prisma.user.create({ data: { role, phone: `rt-${randomUUID()}`, status: 'ACTIVE' } });
  createdUserIds.push(u.id);
  return u.id;
}

beforeAll(async () => {
  server = createServer(app);
  gateway.attach(server);
  await new Promise<void>((res) => server.listen(0, res));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

function connect(token: string): Promise<ClientSocket> {
  const sock = ioClient(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', (e) => reject(e));
  });
}
function emitAck<T>(sock: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => sock.emit(event, payload, resolve as (r: T) => void));
}
function once<T>(sock: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => sock.on(event, (d: T) => resolve(d)));
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 25));

describe('realtime gateway pushes (TRD §4)', () => {
  it('emitToUser reaches only the targeted user room', async () => {
    const aliceId = await activeUserId('USHER');
    const bobId = await activeUserId('USHER');
    const alice = await connect(await signAccessToken(aliceId, 'USHER'));
    const bob = await connect(await signAccessToken(bobId, 'USHER'));
    await settle(); // let the auto-join to user:<id> settle
    try {
      const got = once<{ status: string }>(alice, 'booking.confirmed');
      let bobGot = false;
      bob.on('booking.confirmed', () => (bobGot = true));

      gateway.emitToUser(aliceId, 'booking.confirmed', { bookingId: 'b1', status: 'CONFIRMED', at: 'now' });

      expect((await got).status).toBe('CONFIRMED');
      expect(bobGot).toBe(false);
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('emitToAdmins reaches ADMINs only (the check-in feed)', async () => {
    const admin = await connect(await signAccessToken(await activeUserId('ADMIN'), 'ADMIN'));
    const usher = await connect(await signAccessToken(await activeUserId('USHER'), 'USHER'));
    await settle();
    try {
      const got = once<{ bookingId: string }>(admin, 'booking.checked_in');
      let usherGot = false;
      usher.on('booking.checked_in', () => (usherGot = true));

      gateway.emitToAdmins('booking.checked_in', { bookingId: 'b2', status: 'CHECKED_IN', at: 'now' });

      expect((await got).bookingId).toBe('b2');
      expect(usherGot).toBe(false);
    } finally {
      admin.close();
      usher.close();
    }
  });
});

describe('realtime chat upgrade — typing + read receipts (UXRD §6)', () => {
  let scenario: Scenario | null = null;
  afterEach(async () => {
    if (scenario) {
      const convs = await prisma.conversation.findMany({ where: { bookingId: { in: scenario.bookingIds } } });
      await prisma.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
      await prisma.conversation.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
      await teardown(scenario);
    }
    scenario = null;
  });

  it('relays typing and read receipts to the other party', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_rt')); // → CONFIRMED unlocks chat
    const bookingId = scenario.bookingIds[0]!;

    const client = await connect(await signAccessToken(scenario.clientUserId, 'CLIENT'));
    const usher = await connect(await signAccessToken(scenario.usherUserId, 'USHER'));
    try {
      await emitAck(client, 'room:join', { bookingId });
      await emitAck(usher, 'room:join', { bookingId });

      // typing relay is ephemeral and goes to the *other* party only
      const typing = once<{ userId: string; typing: boolean }>(usher, 'typing');
      client.emit('typing:start', { bookingId });
      const t = await typing;
      expect(t.typing).toBe(true);
      expect(t.userId).toBe(scenario.clientUserId);

      // usher sends; client marks seen; usher receives the read receipt
      await emitAck(usher, 'message:send', { bookingId, content: 'on my way' });
      const receipt = once<{ userId: string }>(usher, 'message:seen');
      const ack = await emitAck<{ ok: boolean; seen: number }>(client, 'message:seen', { bookingId });
      expect(ack.ok).toBe(true);
      expect(ack.seen).toBeGreaterThanOrEqual(1);
      expect((await receipt).userId).toBe(scenario.clientUserId);
    } finally {
      client.close();
      usher.close();
    }
  });
});
