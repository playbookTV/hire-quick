/**
 * Process-wide structured logger (pino). Use this instead of console.* so logs
 * are JSON, level-filtered (LOG_LEVEL), and parseable by the log pipeline.
 * Unhandled 5xx errors are logged here via the app error middleware; add module
 * loggers with `logger.child({ module: '...' })` as needed.
 */
import { pino } from 'pino';
import { env } from './env.js';
import { safeError } from './observability/privacy.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: env.PROCESS_TYPE === 'worker' ? 'hirequick-worker' : 'hirequick-api', env: env.NODE_ENV, release: env.SENTRY_RELEASE || undefined },
  serializers: { err: safeError },
  redact: { paths: ['password', 'token', 'secret', 'authorization', 'cookie', 'req.headers', 'req.body', 'res.headers'], censor: '[redacted]' },
});
