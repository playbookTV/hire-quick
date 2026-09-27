import * as Sentry from '@sentry/react';
import { createSmileReporter } from '@hq/shared';
import { sanitizeAdminEvent } from './monitoring-privacy';

Sentry.init({
  dsn: 'https://3f64ffc441e4cd2348e074a1a73f6d91@o4508932213637120.ingest.de.sentry.io/4512159731744848',
  enabled: import.meta.env.PROD,
  environment: 'railway',
  release: 'hirequick-admin-smile-monitoring-20260927',
  defaultIntegrations: false,
  integrations: [Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration()],
  dataCollection: { userInfo: false },
  maxBreadcrumbs: 0,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: sanitizeAdminEvent,
});

export const MonitoringBoundary = Sentry.ErrorBoundary;
export const reportSmile = createSmileReporter((code, tags, level) => {
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    scope.setFingerprint(['hirequick', code]);
    Sentry.captureMessage(code, level);
  });
});
