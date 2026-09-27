import { z } from 'zod';
import { Redis } from 'ioredis';
import { redisConnection } from '../modules/jobs/redis.js';
import { env } from '../env.js';

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('booking'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('admins') }).strict(),
]);
const schema = z.object({
  version: z.literal(1), target, event: z.string().min(1).max(128), payload: z.unknown(),
  excludeSocketId: z.string().max(200).optional(),
}).strict();
export type PrivateEvent = z.infer<typeof schema>;
const MAX_ENVELOPE_BYTES = 64 * 1024;

export function encodePrivateEvent(event: PrivateEvent): string | null {
  try {
    const encoded = JSON.stringify(schema.parse(event));
    return Buffer.byteLength(encoded) <= MAX_ENVELOPE_BYTES ? encoded : null;
  } catch { return null; }
}
export function decodePrivateEvent(encoded: string): PrivateEvent | null {
  if (Buffer.byteLength(encoded) > MAX_ENVELOPE_BYTES) return null;
  try { return schema.parse(JSON.parse(encoded)); } catch { return null; }
}

/** Pub/sub spans Redis databases, so explicitly isolate the channel by DB and runtime. */
function channel(redisUrl: string): string {
  return `hq:realtime:authorized:v1:${env.NODE_ENV}:${redisConnection(redisUrl).db}`;
}
function connection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1, commandTimeout: 2000, enableOfflineQueue: false,
  });
}

/**
 * Publish once; every node (including the origin) delivers from its subscription.
 * No raw Socket.IO adapter broadcast can bypass recipient authorization.
 * Outages drop convenience signals; DB history is the recovery source.
 */
export function createPrivateFanout(redisUrl: string, receive?: (event: PrivateEvent) => void) {
  const topic = channel(redisUrl);
  const pub = connection(redisUrl);
  const sub = receive ? connection(redisUrl) : null;
  let subscribed = !receive;
  let closed = false;
  pub.on('error', () => { /* No payload, credentials or provider errors in logs. */ });
  if (sub) {
    sub.on('error', () => { subscribed = false; });
    sub.on('close', () => { subscribed = false; });
    sub.on('ready', () => {
      void sub.subscribe(topic).then(() => { if (!closed) subscribed = true; }).catch(() => { subscribed = false; });
    });
    sub.on('message', (name, encoded) => {
      if (!closed && subscribed && name === topic) {
        const event = decodePrivateEvent(encoded);
        if (event) receive?.(event);
      }
    });
  }
  return {
    redis: pub,
    ready: () => !closed && pub.status === 'ready' && subscribed && (!sub || sub.status === 'ready'),
    publish(event: PrivateEvent): void {
      const encoded = encodePrivateEvent(event);
      if (!encoded || closed || pub.status !== 'ready' || !subscribed || (sub && sub.status !== 'ready')) return;
      void pub.publish(topic, encoded).catch(() => { /* Fail closed: no local bypass. */ });
    },
    close(): void {
      closed = true;
      subscribed = false;
      pub.disconnect();
      sub?.disconnect();
    },
  };
}
