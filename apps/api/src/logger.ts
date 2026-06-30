/**
 * Process-wide structured logger (pino). Use this instead of console.* so logs
 * are JSON, level-filtered (LOG_LEVEL), and parseable by the log pipeline.
 * Unhandled 5xx errors are logged here via the app error middleware; add module
 * loggers with `logger.child({ module: '...' })` as needed.
 */
import { pino } from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'hirequick-api', env: env.NODE_ENV },
});
