import * as Sentry from '@sentry/node';
import { logger } from '../logger.js';

export type AlarmCode = 'RECONCILIATION_ERROR' | 'RECONCILIATION_REVIEW' | 'AUDIT_CHAIN_BROKEN';

export function reportError(
  error: unknown,
  tags: { reqId?: string; code?: string; job?: string },
): void {
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    Sentry.captureException(error);
  });
}

export function reportAlarm(code: AlarmCode): void {
  logger.error({ code }, 'operational alarm');
  Sentry.withScope((scope) => {
    scope.setTag('code', code);
    scope.setFingerprint(['hirequick', code]);
    Sentry.captureMessage('HireQuick operational alert', 'error');
  });
}

export async function flushMonitoring(): Promise<void> {
  await Sentry.flush(2000);
}
