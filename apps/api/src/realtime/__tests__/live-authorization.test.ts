/** Real DB/socket boundary; root executes only in a disposable schema. */
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { SignJWT } from 'jose';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { env } from '../../env.js';
import { createSocketGateway } from '../gateway.js';
import { RT } from '../events.js';
import { signAccessToken, signRefreshToken } from '../../modules/auth/tokens.js';
import { assertDisposableDatabase } from '../../modules/auth/__tests__/assert-disposable-db.js';

const gateway = createSocketGateway();
const app = createApp({ realtime: gateway });
let server: HttpServer;
let baseUrl: string;
let validated = false;
const users: string[] = [];
const bookings: string[] = [];
const events: string[] = [];
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await assertDisposableDatabase(); validated = true;
  server = createServer(app); gateway.attach(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  if (!validated) return;
  await prisma.conversation.deleteMany({ where: { bookingId: { in: bookings } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookings.splice(0) } } });
  await prisma.event.deleteMany({ where: { id: { in: events.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});
afterAll(async () => { if (validated) await gateway.io?.close(); });

async function pair(userId: string, role: 'CLIENT' | 'USHER' | 'ADMIN') {
  const refreshToken = await signRefreshToken(userId);
  return { refreshToken, accessToken: await signAccessToken(userId, role, refreshToken) };
}
async function fixture() {
  if (!validated) throw new Error('disposable database guard required');
  const owner = await prisma.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', phone: `socket-owner-${randomUUID()}`, client: { create: { displayName: 'Socket owner' } } }, include: { client: true } });
  const usher = await prisma.user.create({ data: { role: 'USHER', status: 'ACTIVE', phone: `socket-usher-${randomUUID()}`, usher: { create: {} } }, include: { usher: true } });
  users.push(owner.id, usher.id);
  const event = await prisma.event.create({ data: { clientId: owner.client!.id, title: 'Socket fixture', venue: 'Private', category: 'Gala', headcount: 1, budgetPerHead: 10000, eventDate: new Date('2027-12-01'), startTime: '10:00', endTime: '16:00', status: 'OPEN' } });
  events.push(event.id);
  // Authorization-only fixture: no claim of provider funding or ledger lifecycle.
  const booking = await prisma.booking.create({ data: { eventId: event.id, usherId: usher.usher!.id, amount: 10000, status: 'CONFIRMED' } });
  bookings.push(booking.id);
  return { owner, usher, bookingId: booking.id, ownerPair: await pair(owner.id, 'CLIENT'), usherPair: await pair(usher.id, 'USHER') };
}
async function connect(token: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connection timeout')), 15_000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); socket.close(); reject(error); });
  });
  return socket;
}
function once<T>(socket: ClientSocket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`socket event timeout: ${name}`)), 20_000);
    socket.once(name, (value: T) => { clearTimeout(timer); resolve(value); });
  });
}
function ack(socket: ClientSocket, event: string, payload: unknown): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve, reject) => socket.timeout(20_000).emit(event, payload, (error: Error | null, value: { ok: boolean; code?: string }) => error ? reject(error) : resolve(value)));
}

// Markers pass through the same per-socket output queue, avoiding sleep-based no-delivery assertions.
async function marker(socket: ClientSocket, userId: string) {
  const name = `marker.${randomUUID()}`;
  const received = once(socket, name);
  gateway.emitToUser(userId, name, { done: true });
  await received;
}

describe('live socket account, session and audience authorization (OVA-144)', () => {
  it('rejects unbound legacy socket access without changing REST compatibility', async () => {
    const f = await fixture();
    const legacy = await signAccessToken(f.owner.id, 'CLIENT');
    expect((await request(server).get('/api/me').set('Authorization', `Bearer ${legacy}`)).status).toBe(200);
    await expect(connect(legacy)).rejects.toThrow('unauthenticated');
  });
  it.each(['SUSPENDED', 'ANONYMIZED'] as const)('drops outgoing private messages after %s and disconnects the existing socket', async (status) => {
    const f = await fixture();
    const socket = await connect(f.usherPair.accessToken);
    expect((await ack(socket, 'room:join', { bookingId: f.bookingId })).ok).toBe(true);
    const received: unknown[] = []; socket.on(RT.MESSAGE_NEW, (value: unknown) => received.push(value));
    await prisma.user.update({ where: { id: f.usher.id }, data: { status } });
    const disconnected = once(socket, 'disconnect');
    gateway.emitToBooking(f.bookingId, RT.MESSAGE_NEW, { bookingId: f.bookingId, content: 'private body' });
    await disconnected;
    expect(received).toEqual([]);
  });
  it('rejects an incoming write from a socket connected before suspension', async () => {
    const f = await fixture();
    const socket = await connect(f.ownerPair.accessToken);
    await prisma.user.update({ where: { id: f.owner.id }, data: { status: 'SUSPENDED' } });
    const disconnected = once(socket, 'disconnect');
    socket.emit('message:send', { bookingId: f.bookingId, content: 'must not persist' });
    await disconnected;
    expect(await prisma.message.count({ where: { senderId: f.owner.id } })).toBe(0);
  });
  it('logout blocks the matching existing connection but preserves an independent login', async () => {
    const f = await fixture();
    const old = await connect(f.ownerPair.accessToken);
    const independent = await connect((await pair(f.owner.id, 'CLIENT')).accessToken);
    const received: unknown[] = []; old.on('private.logout', (value: unknown) => received.push(value));
    expect((await request(server).post('/auth/logout').send({ refreshToken: f.ownerPair.refreshToken })).status).toBe(204);
    const disconnected = once(old, 'disconnect');
    const delivered = once(independent, 'private.logout');
    gateway.emitToUser(f.owner.id, 'private.logout', { private: true });
    await Promise.all([disconnected, delivered]);
    expect(received).toEqual([]);
    expect(independent.connected).toBe(true);
  });
  it('rotation invalidates the prior socket binding and accepts the new pair', async () => {
    const f = await fixture();
    const old = await connect(f.ownerPair.accessToken);
    const rotated = await request(server).post('/auth/refresh').send({ refreshToken: f.ownerPair.refreshToken });
    expect(rotated.status).toBe(200);
    const next = await connect((rotated.body as { accessToken: string }).accessToken);
    const disconnected = once(old, 'disconnect');
    await marker(next, f.owner.id);
    await disconnected;
    await expect(connect(f.ownerPair.accessToken)).rejects.toThrow('unauthenticated');
  });
  it('disconnects an idle socket at token expiry', async () => {
    const f = await fixture();
    const exp = Math.floor(Date.now() / 1000) + 10;
    const refresh = await new SignJWT({ typ: 'refresh' }).setProtectedHeader({ alg: 'HS256' }).setSubject(f.owner.id).setJti(randomUUID()).setExpirationTime(exp).sign(new TextEncoder().encode(env.JWT_REFRESH_SECRET));
    const socket = await connect(await signAccessToken(f.owner.id, 'CLIENT', refresh));
    await once(socket, 'disconnect');
    expect(socket.connected).toBe(false);
  });
  it('removes a demoted admin from outgoing operational access', async () => {
    const user = await prisma.user.create({ data: { phone: `socket-admin-${randomUUID()}`, status: 'ACTIVE', role: 'ADMIN' } });
    users.push(user.id);
    const socket = await connect((await pair(user.id, 'ADMIN')).accessToken);
    const received: unknown[] = []; socket.on('private.admin', (value: unknown) => received.push(value));
    await prisma.user.update({ where: { id: user.id }, data: { role: 'CLIENT' } });
    const disconnected = once(socket, 'disconnect');
    gateway.emitToAdmins('private.admin', { confidential: true });
    await disconnected;
    expect(received).toEqual([]);
  });
  it.each(['PENDING_PAYMENT', 'CANCELLED', 'foreign-usher'] as const)('rechecks booking audience/state after %s changes', async (change) => {
    const f = await fixture();
    const socket = await connect(f.usherPair.accessToken);
    expect((await ack(socket, 'room:join', { bookingId: f.bookingId })).ok).toBe(true);
    const received: unknown[] = []; socket.on(RT.MESSAGE_NEW, (value: unknown) => received.push(value));
    if (change === 'foreign-usher') {
      const replacement = await prisma.user.create({ data: { phone: `replacement-${randomUUID()}`, status: 'ACTIVE', role: 'USHER', usher: { create: {} } }, include: { usher: true } });
      users.push(replacement.id);
      await prisma.booking.update({ where: { id: f.bookingId }, data: { usherId: replacement.usher!.id } });
    } else await prisma.booking.update({ where: { id: f.bookingId }, data: { status: change } });
    gateway.emitToBooking(f.bookingId, RT.MESSAGE_NEW, { bookingId: f.bookingId, content: 'must stay private' });
    await marker(socket, f.usher.id);
    expect(received).toEqual([]);
    expect((await ack(socket, 'typing:start', { bookingId: f.bookingId })).ok).toBe(false);
  });
  it('applies the same malformed and oversized message bounds before REST/socket writes', async () => {
    const f = await fixture();
    const socket = await connect(f.ownerPair.accessToken);
    for (const body of [null, { content: 'x'.repeat(4001) }, { content: 'x', contentType: 'HTML' }]) {
      expect((await request(server).post(`/api/bookings/${f.bookingId}/messages`).set('Authorization', `Bearer ${f.ownerPair.accessToken}`).set('Content-Type', 'application/json').send(JSON.stringify(body))).status).toBe(400);
      const response = await ack(socket, 'message:send', body && typeof body === 'object' ? { ...body, bookingId: f.bookingId } : body);
      expect(response).toMatchObject({ ok: false, code: 'VALIDATION' });
    }
    expect(await prisma.message.count({ where: { senderId: f.owner.id } })).toBe(0);
  });
});
