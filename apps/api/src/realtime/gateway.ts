/**
 * Realtime gateway (TRD §4, UXRD §6). One Socket.IO surface for booking chat AND
 * server→client lifecycle pushes (booking status, admin check-in feed, withdrawal
 * status). Business code stays transport-agnostic by depending on the
 * `RealtimeGateway` interface (hexagonal, mirrors PaystackPort), so it is testable
 * with a no-op and swappable across processes:
 *
 *  - API process  → `createSocketGateway()` wraps the live `io` (+ Redis adapter
 *    for cross-replica fan-out on Railway).
 *  - worker process → `createEmitterGateway()` publishes to the same Redis channels
 *    via @socket.io/redis-emitter, since scheduled jobs (auto-complete, no-show)
 *    run there and hold no sockets of their own.
 *
 * Rooms: `user:<userId>` (per-user pushes), `booking:<id>` (chat + booking events),
 * `admin:feed` (ADMIN-only operational feed).
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';
import type { MessageContentType } from '@hq/database';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { assertParty, sendMessage, markSeen } from './messages.js';
import { RT, type ConversationUnreadPayload } from './events.js';

/** The transport-agnostic port that lifecycle code emits through. */
export interface RealtimeGateway {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToBooking(bookingId: string, event: string, payload: unknown): void;
  emitToAdmins(event: string, payload: unknown): void;
}

/** A live `io` gateway also exposes attach() and the raw server for tests. */
export interface SocketGateway extends RealtimeGateway {
  attach(server: HttpServer): Server;
  readonly io: Server | null;
}

/** Default implementation: drops everything. Used in tests and when realtime is absent. */
export const noopGateway: RealtimeGateway = {
  emitToUser() {},
  emitToBooking() {},
  emitToAdmins() {},
};

/** Minimal structural view of the bits of `io`/`Emitter` we use. */
interface Broadcastable {
  to(room: string): { emit(event: string, ...args: unknown[]): unknown };
}

function emitMethods(target: () => Broadcastable | null): RealtimeGateway {
  return {
    emitToUser(userId, event, payload) {
      target()?.to(`user:${userId}`).emit(event, payload);
    },
    emitToBooking(bookingId, event, payload) {
      target()?.to(`booking:${bookingId}`).emit(event, payload);
    },
    emitToAdmins(event, payload) {
      target()?.to('admin:feed').emit(event, payload);
    },
  };
}

// ---- Socket connection handling (chat + presence rooms) ---------------------

type Ack = (response: unknown) => void;
interface JoinPayload {
  bookingId: string;
}
interface SendPayload {
  bookingId: string;
  content: string;
  contentType?: MessageContentType;
}
interface SeenPayload {
  bookingId: string;
  upToMessageId?: string;
}
interface TypingPayload {
  bookingId: string;
}

function userIdOf(socket: Socket): string {
  return (socket.data as { userId?: string }).userId ?? '';
}
function roleOf(socket: Socket): string {
  return (socket.data as { role?: string }).role ?? '';
}

async function handleJoin(socket: Socket, payload: JoinPayload, ack?: Ack): Promise<void> {
  try {
    await assertParty(payload.bookingId, userIdOf(socket));
    await socket.join(`booking:${payload.bookingId}`);
    ack?.({ ok: true });
  } catch {
    ack?.({ ok: false, error: 'forbidden' });
  }
}

async function handleSend(io: Server, socket: Socket, payload: SendPayload, ack?: Ack): Promise<void> {
  try {
    const msg = await sendMessage({
      bookingId: payload.bookingId,
      senderId: userIdOf(socket),
      content: payload.content,
      ...(payload.contentType ? { contentType: payload.contentType } : {}),
    });
    io.to(`booking:${payload.bookingId}`).emit(RT.MESSAGE_NEW, msg);
    // Nudge the recipient's inbox badge even if they aren't in the booking room.
    const unread: ConversationUnreadPayload = { bookingId: payload.bookingId, from: msg.senderId };
    io.to(`user:${msg.recipientUserId}`).emit(RT.CONVERSATION_UNREAD, unread);
    ack?.({ ok: true, message: msg });
  } catch (e) {
    ack?.({ ok: false, error: e instanceof Error ? e.message : 'send failed' });
  }
}

async function handleSeen(io: Server, socket: Socket, payload: SeenPayload, ack?: Ack): Promise<void> {
  try {
    const count = await markSeen(payload.bookingId, userIdOf(socket), payload.upToMessageId);
    io.to(`booking:${payload.bookingId}`).emit(RT.MESSAGE_SEEN, {
      bookingId: payload.bookingId,
      userId: userIdOf(socket),
      at: new Date().toISOString(),
    });
    ack?.({ ok: true, seen: count });
  } catch (e) {
    ack?.({ ok: false, error: e instanceof Error ? e.message : 'seen failed' });
  }
}

/** Typing is ephemeral (not persisted). Only relay for rooms the socket actually joined. */
function relayTyping(socket: Socket, payload: TypingPayload, typing: boolean): void {
  const room = `booking:${payload?.bookingId}`;
  if (!payload?.bookingId || !socket.rooms.has(room)) return;
  socket.to(room).emit(RT.TYPING, { bookingId: payload.bookingId, userId: userIdOf(socket), typing });
}

function onConnection(io: Server, socket: Socket): void {
  void socket.join(`user:${userIdOf(socket)}`);
  if (roleOf(socket) === 'ADMIN') void socket.join('admin:feed');

  socket.on('room:join', (p: JoinPayload, ack?: Ack) => void handleJoin(socket, p, ack));
  socket.on('message:send', (p: SendPayload, ack?: Ack) => void handleSend(io, socket, p, ack));
  socket.on('message:seen', (p: SeenPayload, ack?: Ack) => void handleSeen(io, socket, p, ack));
  socket.on('typing:start', (p: TypingPayload) => relayTyping(socket, p, true));
  socket.on('typing:stop', (p: TypingPayload) => relayTyping(socket, p, false));
}

// ---- Gateway factories ------------------------------------------------------

/**
 * Build the API-process gateway. Pass `redisUrl` to enable cross-replica fan-out
 * via the Redis adapter; omit it (tests, single-node dev) to use the in-memory
 * adapter so no Redis connection is opened.
 */
export function createSocketGateway(opts: { redisUrl?: string } = {}): SocketGateway {
  let io: Server | null = null;
  const base = emitMethods(() => io);

  function attach(server: HttpServer): Server {
    const server_io = new Server(server, { cors: { origin: false }, serveClient: false });

    if (opts.redisUrl) {
      const pub = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
      const sub = pub.duplicate();
      server_io.adapter(createAdapter(pub, sub));
    }

    server_io.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) {
        next(new Error('unauthenticated'));
        return;
      }
      verifyAccessToken(token).then(
        (a) => {
          (socket.data as { userId: string; role: string }).userId = a.userId;
          (socket.data as { userId: string; role: string }).role = a.role;
          next();
        },
        () => next(new Error('unauthenticated')),
      );
    });

    server_io.on('connection', (socket) => onConnection(server_io, socket));
    io = server_io;
    return server_io;
  }

  return { ...base, attach, get io() { return io; } };
}

/**
 * Worker-process gateway: no Socket.IO server, just publishes to the same Redis
 * channels the API-process adapter listens on, so emits from scheduled jobs reach
 * connected clients. Requires Redis.
 */
export function createEmitterGateway(redisUrl: string): RealtimeGateway {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const emitter = new Emitter(redis);
  return emitMethods(() => emitter);
}

/**
 * Back-compat convenience: attach a fresh socket gateway to an HTTP server and
 * return the `io`. Prefer `createSocketGateway()` when you also need to emit.
 */
export function attachRealtime(server: HttpServer, opts: { redisUrl?: string } = {}): Server {
  return createSocketGateway(opts).attach(server);
}
