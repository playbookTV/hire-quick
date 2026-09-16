import { isIP } from 'node:net';
import { env } from '../../env.js';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: { servername?: string };
  maxRetriesPerRequest: null;
}

/**
 * BullMQ connection options parsed from REDIS_URL. We pass options (not an
 * ioredis instance) so BullMQ owns the connection — avoids ioredis version
 * skew between our dep and BullMQ's. `maxRetriesPerRequest: null` is required.
 */
export function redisConnection(redisUrl = env.REDIS_URL): RedisConnectionOptions {
  let u: URL;
  let username: string;
  let password: string;
  try {
    u = new URL(redisUrl);
    username = decodeURIComponent(u.username);
    password = decodeURIComponent(u.password);
  } catch {
    // URL/URI errors can carry the original input (including credentials).
    throw new Error('REDIS_URL must be a valid Redis connection URL');
  }
  if (!['redis:', 'rediss:'].includes(u.protocol) || !u.hostname || u.search || u.hash) {
    throw new Error('REDIS_URL requires redis:// or rediss:// without query or fragment');
  }
  if (u.pathname !== '' && u.pathname !== '/' && !/^\/\d+$/.test(u.pathname)) {
    throw new Error('REDIS_URL database path must be a nonnegative integer');
  }
  const db = u.pathname === '' || u.pathname === '/' ? 0 : Number(u.pathname.slice(1));
  if (!Number.isSafeInteger(db) || db > 2_147_483_647) {
    throw new Error('REDIS_URL database index is out of range');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const port = u.port ? Number(u.port) : 6379;
  if (port === 0) throw new Error('REDIS_URL port must be between 1 and 65535');
  return {
    host,
    port,
    db,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(u.protocol === 'rediss:' ? { tls: isIP(host) ? {} : { servername: host } } : {}),
    maxRetriesPerRequest: null,
  };
}

/** Log only routing information, never URL userinfo/query/fragment. */
export function redisConnectionLabel(redisUrl = env.REDIS_URL): string {
  const connection = redisConnection(redisUrl);
  const host = isIP(connection.host) === 6 ? `[${connection.host}]` : connection.host;
  return `${connection.tls ? 'rediss' : 'redis'}://${host}:${connection.port}/${connection.db}`;
}
