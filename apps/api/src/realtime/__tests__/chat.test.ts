import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { attachRealtime } from '../socket.js';
import { signAccessToken } from '../../modules/auth/tokens.js';
import { holdOrder } from '../../modules/payments/ledger/ledger.js';
import { InMemoryPaystack } from '../../modules/payments/port/paystack-port.js';
import { createScenario, teardown, type Scenario } from '../../modules/payments/__tests__/fixtures.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });
let server: HttpServer;
let port: number;

beforeAll(async () => {
  server = createServer(app);
  attachRealtime(server);
  await new Promise<void>((res) => server.listen(0, res));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
});

let scenario: Scenario | null = null;
const extraUserIds: string[] = [];
afterEach(async () => {
  if (extraUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: extraUserIds.splice(0) } } });
  }
  if (scenario) {
    const convs = await prisma.conversation.findMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await prisma.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
    await prisma.conversation.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
  }
  scenario = null;
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

describe('realtime booking chat (UXRD §6)', () => {
  it('parties exchange messages; contact info is flagged; non-party is rejected', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_chat')); // → CONFIRMED (unlocks chat)
    const bookingId = scenario.bookingIds[0]!;

    const clientToken = await signAccessToken(scenario.clientUserId, 'CLIENT');
    const usherToken = await signAccessToken(scenario.usherUserId, 'USHER');

    const clientSock = await connect(clientToken);
    const usherSock = await connect(usherToken);

    try {
      expect(await emitAck<{ ok: boolean }>(clientSock, 'room:join', { bookingId })).toMatchObject({ ok: true });
      expect(await emitAck<{ ok: boolean }>(usherSock, 'room:join', { bookingId })).toMatchObject({ ok: true });

      // client sends; usher receives in realtime
      const received = new Promise<{ content: string; flagged: boolean }>((res) =>
        usherSock.on('message:new', (m: { content: string; flagged: boolean }) => res(m)),
      );
      await emitAck(clientSock, 'message:send', { bookingId, content: 'Hi, see you at the venue!' });
      const msg = await received;
      expect(msg.content).toContain('venue');
      expect(msg.flagged).toBe(false);

      // contact-sharing is flagged (non-blocking)
      const flaggedAck = await emitAck<{ ok: boolean; message: { flagged: boolean } }>(
        clientSock,
        'message:send',
        { bookingId, content: 'call me on 08031234567' },
      );
      expect(flaggedAck.message.flagged).toBe(true);

      // REST history reflects both messages
      const hist = await request(server).get(`/api/bookings/${bookingId}/messages`).set('Authorization', `Bearer ${usherToken}`);
      expect(hist.status).toBe(200);
      expect(hist.body).toHaveLength(2);

      // a non-party (real ACTIVE user, but not on this booking) cannot join the room
      const stranger = await prisma.user.create({
        data: { role: 'CLIENT', phone: `stranger-${randomUUID()}`, status: 'ACTIVE' },
      });
      extraUserIds.push(stranger.id);
      const strangerSock = await connect(await signAccessToken(stranger.id, 'CLIENT'));
      const joinAck = await emitAck<{ ok: boolean }>(strangerSock, 'room:join', { bookingId });
      expect(joinAck.ok).toBe(false);
      strangerSock.close();
    } finally {
      clientSock.close();
      usherSock.close();
    }
  });
});
