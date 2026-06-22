/**
 * Per-endpoint rate limiting (TRD §14: "per-endpoint rate limiting").
 *
 * Backed by Redis so counters are shared across API instances — an in-memory
 * store would be per-process and trivially bypassable behind a load balancer.
 * The Redis client is injected (mirroring the Paystack-port DI in app.ts): when
 * none is provided (tests, or a dev box without Redis) the limiters degrade to
 * pass-through middleware so nothing external is required to exercise the app.
 *
 * 429 bodies match the global error envelope: { error: { code, message } }.
 */
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import type { RequestHandler } from 'express';

export interface RateLimiters {
  /** Lenient ceiling on every request — a coarse abuse backstop. */
  global: RequestHandler;
  /** Strict: OTP/login/refresh are brute-force targets. */
  auth: RequestHandler;
  /** Moderate: money-mutating endpoints (charge, withdrawal). */
  money: RequestHandler;
}

const passThrough: RequestHandler = (_req, _res, next) => {
  next();
};

interface Spec {
  windowMs: number;
  max: number;
  name: string;
}

function build(redis: Redis, spec: Spec): RateLimitRequestHandler {
  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      // ioredis: route raw commands through .call(); rate-limit-redis builds the
      // SCRIPT/EVAL itself, we just forward the argument vector.
      sendCommand: (...args: string[]): Promise<number | string | (number | string)[]> =>
        redis.call(...(args as [string, ...string[]])) as Promise<number | string | (number | string)[]>,
      prefix: `rl:${spec.name}:`,
    }),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
  });
}

/** Build the limiter set. With no Redis client, all three are pass-throughs. */
export function createRateLimiters(redis?: Redis): RateLimiters {
  if (!redis) {
    return { global: passThrough, auth: passThrough, money: passThrough };
  }
  return {
    global: build(redis, { windowMs: 60_000, max: 300, name: 'global' }),
    auth: build(redis, { windowMs: 60_000, max: 10, name: 'auth' }),
    money: build(redis, { windowMs: 60_000, max: 30, name: 'money' }),
  };
}
