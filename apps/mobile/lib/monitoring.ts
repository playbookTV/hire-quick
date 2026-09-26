import * as Sentry from '@sentry/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { sanitizeMobileEvent } from './monitoring-privacy.js';

// A DSN is a public ingestion address, not the private build-upload auth token.
const dsn =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  'https://6fe921194b22e2d0bc8b4c96b54915fc@o4508932213637120.ingest.de.sentry.io/4512148946616400';
const enabled = !__DEV__ && Boolean(dsn);

Sentry.init({
  dsn,
  enabled,
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production'),
  enableNative:
    enabled &&
    Platform.OS !== 'web' &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient,
  sendDefaultPii: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  beforeSend: sanitizeMobileEvent,
  tracesSampleRate: 0,
  enableAutoPerformanceTracing: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enableAppStartTracking: false,
  enableNativeFramesTracking: false,
  initialScope: { tags: { service: 'hirequick-mobile' } },
});

// Expo Router handles render failures itself, so its fallback reports them.
const reported = new WeakSet<Error>();
export function reportRenderError(error: Error): void {
  if (reported.has(error)) return;
  reported.add(error);
  Sentry.captureException(error);
}

export const withMonitoring = Sentry.wrap;
