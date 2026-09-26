/**
 * Authorized realtime delivery (TRD §4/§14, UXRD §6).
 * Incoming actions and outgoing private packets revalidate account, JWT/session
 * and audience. Redis transports envelopes to each node; it never broadcasts
 * directly to sockets. Signals remain best-effort, with DB state authoritative.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { ZodError } from 'zod';
import { ApiError } from '../app.js';
import { assertParty, assertMessageableParty, sendMessage, markSeen } from './messages.js';
import { RT } from './events.js';
import { bookingChatScope, socketMessageInput, seenMessageInput } from './validation.js';
import { authorizeSocketToken } from './socket-auth.js';
import { createSocketRateLimiter } from './rate-limit.js';
import { createPrivateFanout, decodePrivateEvent, encodePrivateEvent, type PrivateEvent } from './fanout.js';

export interface RealtimeGateway {
  emitToUser(userId: string, event: string, payload: unknown): void;
  emitToBooking(bookingId: string, event: string, payload: unknown): void;
  emitToAdmins(event: string, payload: unknown): void;
}
export interface SocketGateway extends RealtimeGateway {
  attach(server: HttpServer): Server;
  ready(): boolean;
  readonly io: Server | null;
}
export const noopGateway: RealtimeGateway = {
  emitToUser() {}, emitToBooking() {}, emitToAdmins() {},
};
type Ack = (response: unknown) => void;
type Principal = Awaited<ReturnType<typeof authorizeSocketToken>>;
const CHAT_EVENTS = new Set<string>([RT.MESSAGE_NEW, RT.MESSAGE_SEEN, RT.TYPING, RT.CONVERSATION_UNREAD]);
const MAX_PENDING_ACTIONS = 8;
const MAX_PENDING_DELIVERIES = 16;

function emitMethods(publish: (event: PrivateEvent) => void): RealtimeGateway {
  return {
    emitToUser(id, event, payload) { publish({ version: 1, target: { kind: 'user', id }, event, payload }); },
    emitToBooking(id, event, payload) { publish({ version: 1, target: { kind: 'booking', id }, event, payload }); },
    emitToAdmins(event, payload) { publish({ version: 1, target: { kind: 'admins' }, event, payload }); },
  };
}
function reject(ack: unknown, error: unknown): void {
  if (typeof ack !== 'function') return;
  const code = error instanceof ZodError ? 'VALIDATION'
    : error instanceof ApiError ? error.code : 'UNAVAILABLE';
  (ack as Ack)({ ok: false, code, error: code === 'VALIDATION' ? 'Invalid chat request' : 'Chat request unavailable' });
}

export function createSocketGateway(opts: { redisUrl?: string } = {}): SocketGateway {
  let io: Server | null = null;
  let fanout: ReturnType<typeof createPrivateFanout> | null = null;
  const sessions = new WeakMap<Socket, { token: string; principal: Principal }>();
  const outboxes = new WeakMap<Socket, { pending: number; chain: Promise<void> }>();

  async function current(socket: Socket): Promise<Principal> {
    const session = sessions.get(socket);
    if (!session || !socket.connected) throw new Error('socket disconnected');
    try {
      const principal = await authorizeSocketToken(session.token);
      if (!socket.connected) throw new Error('socket disconnected');
      return principal;
    } catch {
      socket.disconnect(true);
      throw new Error('socket session unavailable');
    }
  }

  async function deliver(socket: Socket, event: PrivateEvent): Promise<void> {
    const principal = await current(socket);
    const target = event.target;
    if (target.kind === 'user' && target.id !== principal.userId) return;
    if (target.kind === 'admins' && principal.role !== 'ADMIN') return;
    if (target.kind === 'booking') {
      if (CHAT_EVENTS.has(event.event)) await assertMessageableParty(target.id, principal.userId);
      else await assertParty(target.id, principal.userId);
    } else if (CHAT_EVENTS.has(event.event)) {
      // User-room inbox signals also disclose a booking relationship.
      const { bookingId } = bookingChatScope.parse({ bookingId: (event.payload as { bookingId?: unknown } | null)?.bookingId });
      await assertMessageableParty(bookingId, principal.userId);
    }
    // Audience lookup may await I/O: check current session again before emission.
    await current(socket);
    if (socket.connected) socket.emit(event.event, event.payload);
  }

  function receive(event: PrivateEvent): void {
    if (!io) return;
    const target = event.target;
    const room = target.kind === 'admins' ? 'admin:feed' : `${target.kind}:${target.id}`;
    const ids = io.of('/').adapter.rooms.get(room);
    if (!ids) return;
    for (const id of ids) {
      if (id === event.excludeSocketId) continue;
      const socket = io.of('/').sockets.get(id);
      if (!socket) continue;
      let box = outboxes.get(socket);
      if (!box) { box = { pending: 0, chain: Promise.resolve() }; outboxes.set(socket, box); }
      if (box.pending >= MAX_PENDING_DELIVERIES) { socket.disconnect(true); continue; }
      box.pending += 1;
      const active = box;
      active.chain = active.chain.then(() => deliver(socket, event)).catch(() => {
        // No private packet on missing authorization or a DB failure.
      }).finally(() => { active.pending -= 1; });
    }
  }

  function publish(event: PrivateEvent): void {
    if (!io) return;
    if (fanout) { fanout.publish(event); return; }
    // The Redis-free dev/test path still passes through the same audience checks.
    const encoded = encodePrivateEvent(event);
    const parsed = encoded && decodePrivateEvent(encoded);
    if (parsed) receive(parsed);
  }
  const base = emitMethods(publish);

  function attach(server: HttpServer): Server {
    if (io) throw new Error('socket gateway already attached');
    const live = new Server(server, { cors: { origin: false }, serveClient: false, maxHttpBufferSize: 16 * 1024 });
    io = live;
    if (opts.redisUrl) fanout = createPrivateFanout(opts.redisUrl, receive);
    const limiter = createSocketRateLimiter(fanout?.redis);
    server.once('close', () => { fanout?.close(); io = null; });
    live.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length > 8192 || (fanout && !fanout.ready())) {
        next(new Error('unauthenticated')); return;
      }
      void authorizeSocketToken(token).then((principal) => {
        sessions.set(socket, { token, principal });
        socket.data = { userId: principal.userId, role: principal.role };
        next();
      }).catch(() => next(new Error('unauthenticated')));
    });
    live.on('connection', (socket) => {
      const initial = sessions.get(socket)!.principal;
      void socket.join(`user:${initial.userId}`);
      if (initial.role === 'ADMIN') void socket.join('admin:feed');
      const expiry = setTimeout(() => socket.disconnect(true), Math.min(2_147_483_647, Math.max(0, initial.expiresAt - Date.now())));
      expiry.unref();
      socket.once('disconnect', () => { clearTimeout(expiry); sessions.delete(socket); });
      let pending = 0;
      let chain = Promise.resolve();
      const action = (name: string, run: (payload: unknown, principal: Principal) => Promise<unknown>): void => {
        socket.on(name, (payload: unknown, ack?: Ack) => {
          if (pending >= MAX_PENDING_ACTIONS) { reject(ack, new ApiError(429, 'RATE_LIMITED', 'slow down')); return; }
          pending += 1;
          chain = chain.then(async () => {
            if (!socket.connected) return;
            if (fanout && !fanout.ready()) throw new Error('socket transport unavailable');
            if (!(await limiter.take(initial.userId))) throw new ApiError(429, 'RATE_LIMITED', 'slow down');
            const principal = await current(socket);
            const response = await run(payload, principal);
            // Acknowledgments can contain private message bodies too.
            await current(socket);
            if (typeof ack === 'function') ack(response);
          }).catch((error: unknown) => reject(ack, error)).finally(() => { pending -= 1; });
        });
      };
      action('room:join', async (payload, principal) => {
        const { bookingId } = bookingChatScope.parse(payload);
        await assertMessageableParty(bookingId, principal.userId);
        await socket.join(`booking:${bookingId}`);
        return { ok: true };
      });
      action('message:send', async (payload, principal) => {
        const input = socketMessageInput.parse(payload);
        const message = await sendMessage({
          bookingId: input.bookingId, content: input.content, senderId: principal.userId,
          ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
          ...(input.contentType === undefined ? {} : { contentType: input.contentType }),
        });
        base.emitToBooking(input.bookingId, RT.MESSAGE_NEW, message);
        base.emitToUser(message.recipientUserId, RT.CONVERSATION_UNREAD, { bookingId: input.bookingId, from: principal.userId });
        await assertMessageableParty(input.bookingId, principal.userId);
        return { ok: true, message };
      });
      action('message:seen', async (payload, principal) => {
        const { bookingId, upToMessageId } = seenMessageInput.parse(payload);
        await assertMessageableParty(bookingId, principal.userId);
        const seen = await markSeen(bookingId, principal.userId, upToMessageId);
        base.emitToBooking(bookingId, RT.MESSAGE_SEEN, { bookingId, userId: principal.userId, at: new Date().toISOString() });
        await assertMessageableParty(bookingId, principal.userId);
        return { ok: true, seen };
      });
      for (const [name, typing] of [['typing:start', true], ['typing:stop', false]] as const) {
        action(name, async (payload, principal) => {
          const { bookingId } = bookingChatScope.parse(payload);
          await assertMessageableParty(bookingId, principal.userId);
          if (!socket.rooms.has(`booking:${bookingId}`)) throw new ApiError(403, 'FORBIDDEN', 'join first');
          publish({ version: 1, target: { kind: 'booking', id: bookingId }, event: RT.TYPING,
            payload: { bookingId, userId: principal.userId, typing }, excludeSocketId: socket.id });
          return { ok: true };
        });
      }
    });
    return live;
  }
  return { ...base, attach, ready: () => io !== null && (!fanout || fanout.ready()), get io() { return io; } };
}

/** Worker publishes to the same guarded receiving path; close releases its Redis connection. */
export function createEmitterGateway(redisUrl: string): RealtimeGateway & { ready(): boolean; close(): void } {
  const fanout = createPrivateFanout(redisUrl);
  return { ...emitMethods((event) => fanout.publish(event)), ready: fanout.ready, close: () => fanout.close() };
}
export function attachRealtime(server: HttpServer, opts: { redisUrl?: string } = {}): Server {
  return createSocketGateway(opts).attach(server);
}
