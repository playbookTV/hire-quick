import type { Redis } from 'ioredis';

export const SOCKET_RATE_LIMIT = 120;
export const SOCKET_RATE_WINDOW_MS = 60_000;
const SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;

/** Per-user, shared across sockets/replicas; local fallback is for Redis-free dev/tests. */
export function createSocketRateLimiter(redis?: Pick<Redis, 'eval' | 'status'>, now = Date.now) {
  const local = new Map<string, { count: number; expires: number }>();
  return {
    async take(userId: string): Promise<boolean> {
      if (redis) {
        if (redis.status !== 'ready') throw new Error('socket rate limit unavailable');
        const count = await redis.eval(SCRIPT, 1, `rl:socket:${userId}`, SOCKET_RATE_WINDOW_MS);
        if (typeof count !== 'number') throw new Error('socket rate limit unavailable');
        return count <= SOCKET_RATE_LIMIT;
      }
      const time = now();
      let bucket = local.get(userId);
      if (!bucket || bucket.expires <= time) {
        if (local.size >= 10_000) {
          for (const [key, value] of local) if (value.expires <= time) local.delete(key);
          if (local.size >= 10_000 && !local.has(userId)) return false;
        }
        bucket = { count: 0, expires: time + SOCKET_RATE_WINDOW_MS };
        local.set(userId, bucket);
      }
      bucket.count += 1;
      return bucket.count <= SOCKET_RATE_LIMIT;
    },
  };
}
