import * as Sentry from '@sentry/node';
import { createSmileReporter, type SmileDiagnosticCode } from '@hq/shared';

const faults = new WeakMap<Error, { code: SmileDiagnosticCode; attempt?: string }>();
export function tagSmileError<T extends Error>(error: T, code: SmileDiagnosticCode, attempt?: string): T {
  // An outer route boundary must preserve a more specific provider-stage fault.
  if (!faults.has(error)) faults.set(error, { code, ...(attempt ? { attempt } : {}) });
  return error;
}
export const reportSmile = createSmileReporter((code, tags, level) => {
  Sentry.withScope((scope) => {
    scope.setTags(tags);
    scope.setFingerprint(['hirequick', code]);
    Sentry.captureMessage(code, level);
  });
});
export function reportTaggedSmileError(error: unknown): boolean {
  const fault = error instanceof Error ? faults.get(error) : undefined;
  if (!fault) return false;
  reportSmile(fault.code, fault.attempt);
  return true;
}
