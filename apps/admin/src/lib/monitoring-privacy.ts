import type { ErrorEvent } from '@sentry/react';
import { safeSmileTags } from '@hq/shared';

function pick<T extends object, K extends keyof T>(value: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) as Pick<T, K>;
}

export function sanitizeAdminEvent(event: ErrorEvent): ErrorEvent {
  const tags = safeSmileTags(event.tags);
  return {
    type: undefined, ...pick(event, ['event_id', 'timestamp', 'platform', 'release', 'environment', 'level']),
    tags: { service: 'hirequick-admin', ...tags },
    ...(tags.code ? { message: tags.code, fingerprint: ['hirequick', tags.code] } : {}),
    ...(event.exception?.values ? { exception: { values: event.exception.values.map((e) => ({
      ...pick(e, ['type']), value: '[message withheld for privacy]',
      ...(e.stacktrace?.frames ? { stacktrace: { frames: e.stacktrace.frames.map((f) => ({
        ...pick(f, ['function', 'lineno', 'colno', 'in_app']),
        ...(f.filename ? { filename: f.filename.replace(/[?#].*$/, '') } : {}),
      })) } } : {}),
    })) } } : {}),
  };
}
