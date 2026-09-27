import * as Sentry from '@sentry/node';
import { env } from '../env.js';
import { sanitizeErrorEvent } from './privacy.js';
import { logger } from '../logger.js';

// Error reporting only. No automatic HTTP/SQL bodies, breadcrumbs, or session
// recording. Request/job timing comes from the structured logs below.
if (env.SENTRY_DSN && env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    enableRuntimeChannelInjection: false,
    defaultIntegrations: false,
    beforeSend: sanitizeErrorEvent,
    maxBreadcrumbs: 0,
    initialScope: {
      tags: { service: env.PROCESS_TYPE === 'worker' ? 'hirequick-worker' : 'hirequick-api' },
    },
  });
}

// Preserve Node's fatal-exit behavior without printing raw exception messages.
let stopping = false;
function fatal(error: unknown): void {
  if (stopping) return;
  stopping = true;
  logger.fatal({ err: error, code: 'PROCESS_FATAL' }, 'process terminating');
  Sentry.withScope((scope) => {
    scope.setLevel('fatal');
    scope.setTag('code', 'PROCESS_FATAL');
    Sentry.captureException(error);
  });
  const deadline = setTimeout(() => process.exit(1), 2500);
  void Sentry.flush(2000)
    .catch(() => false)
    .finally(() => {
      clearTimeout(deadline);
      process.exit(1);
    });
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
