import * as Sentry from '@sentry/node';
import { env } from '../env.js';
import { sanitizeErrorEvent, sanitizeSpan } from './privacy.js';
import { logger } from '../logger.js';

// Explicit HTTP/job spans only: no automatic HTTP/SQL payload capture.
if (env.SENTRY_DSN && env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    enableRuntimeChannelInjection: false,
    defaultIntegrations: false,
    traceLifecycle: 'stream',
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    tracePropagationTargets: [],
    beforeSend: sanitizeErrorEvent,
    beforeSendSpan: sanitizeSpan,
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
