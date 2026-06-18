import type { ConnectionOptions } from 'bullmq';
import { env } from '../../env.js';

/**
 * BullMQ connection options parsed from REDIS_URL. We pass options (not an
 * ioredis instance) so BullMQ owns the connection — avoids ioredis version
 * skew between our dep and BullMQ's. `maxRetriesPerRequest: null` is required.
 */
export function redisConnection(): ConnectionOptions {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: u.username } : {}),
    ...(u.password ? { password: u.password } : {}),
    maxRetriesPerRequest: null,
  };
}
