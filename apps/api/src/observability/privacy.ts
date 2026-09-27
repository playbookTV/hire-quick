import type { ErrorEvent } from '@sentry/node';
import { safeSmileTags } from '@hq/shared';

function pickDefined<T extends object, K extends keyof T>(value: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(
    keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  ) as Pick<T, K>;
}

/** Error messages can embed SQL values, provider bodies, OTPs and signed URLs. */
export function safeError(error: unknown): { type: string; stack?: string } {
  if (!(error instanceof Error)) return { type: 'UnknownError' };
  return {
    type: error.name,
    ...(error.stack
      ? {
          stack: error.stack
            .split('\n')
            .filter((line) => /^\s+at /.test(line))
            .join('\n'),
        }
      : {}),
  };
}

/** An allowlist, rather than attempting to enumerate every kind of customer PII. */
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  const smile = safeSmileTags(event.tags);
  return {
    type: undefined,
    ...pickDefined(event, [
      'event_id',
      'timestamp',
      'platform',
      'environment',
      'release',
      'level',
      'fingerprint',
    ]),
    ...(event.message ? { message: smile.code ?? 'HireQuick operational alert' } : {}),
    tags: { ...Object.fromEntries(
      Object.entries(event.tags ?? {}).filter(([key]) =>
        ['service', 'code', 'job', 'reqId'].includes(key),
      ),
    ), ...smile },
    ...(event.exception?.values
      ? {
          exception: {
            values: event.exception.values.map((exception) => ({
              ...pickDefined(exception, ['type']),
              value: '[message withheld for privacy]',
              ...(exception.stacktrace?.frames
                ? {
                    stacktrace: {
                      frames: exception.stacktrace.frames.map((frame) =>
                        pickDefined(frame, ['filename', 'function', 'lineno', 'colno', 'in_app']),
                      ),
                    },
                  }
                : {}),
            })),
          },
        }
      : {}),
  };
}
