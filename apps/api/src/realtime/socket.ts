/**
 * Socket.IO realtime layer (TRD §4, UXRD §6). JWT handshake auth; clients join
 * a per-booking room (`booking:<id>`) only if they're a party; `message:send`
 * persists via the shared messages service and broadcasts `message:new`.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { assertParty, sendMessage } from './messages.js';
import type { MessageContentType } from '@hq/database';

type Ack = (response: unknown) => void;
interface JoinPayload {
  bookingId: string;
}
interface SendPayload {
  bookingId: string;
  content: string;
  contentType?: MessageContentType;
}

function userIdOf(socket: Socket): string {
  return (socket.data as { userId?: string }).userId ?? '';
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
    io.to(`booking:${payload.bookingId}`).emit('message:new', msg);
    ack?.({ ok: true, message: msg });
  } catch (e) {
    ack?.({ ok: false, error: e instanceof Error ? e.message : 'send failed' });
  }
}

export function attachRealtime(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: false }, serveClient: false });

  io.use((socket, next) => {
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

  io.on('connection', (socket) => {
    socket.on('room:join', (payload: JoinPayload, ack?: Ack) => {
      void handleJoin(socket, payload, ack);
    });
    socket.on('message:send', (payload: SendPayload, ack?: Ack) => {
      void handleSend(io, socket, payload, ack);
    });
  });

  return io;
}
