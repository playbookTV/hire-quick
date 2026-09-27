import { safeSmileTags } from '@hq/shared';
import type { ErrorEvent, StackFrame } from '@sentry/react-native';

function pickDefined<T extends object, K extends keyof T>(value: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(
    keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  ) as Pick<T, K>;
}

function safeFrames(frames: StackFrame[] | undefined): StackFrame[] | undefined {
  return frames?.map((frame) =>
    pickDefined(frame, [
      'filename',
      'abs_path',
      'function',
      'module',
      'lineno',
      'colno',
      'in_app',
      'instruction_addr',
    ]),
  );
}

/** Retain symbolication metadata without request, account, or screen contents. */
export function sanitizeMobileEvent(event: ErrorEvent): ErrorEvent {
  const smile = safeSmileTags(event.tags);
  return {
    type: undefined,
    ...pickDefined(event, [
      'event_id',
      'timestamp',
      'platform',
      'level',
      'release',
      'dist',
      'environment',
      'sdk',
      'debug_meta',
    ]),
    tags: { service: 'hirequick-mobile', ...smile },
    ...(smile.code ? { fingerprint: ['hirequick', smile.code] } : {}),
    ...(event.message ? { message: smile.code ?? 'HireQuick mobile diagnostic' } : {}),
    ...(event.exception?.values
      ? {
          exception: {
            values: event.exception.values.map((exception) => ({
              ...pickDefined(exception, ['type']),
              value: '[message withheld for privacy]',
              ...(exception.mechanism
                ? { mechanism: pickDefined(exception.mechanism, ['type', 'handled']) }
                : {}),
              ...(exception.stacktrace?.frames
                ? { stacktrace: { frames: safeFrames(exception.stacktrace.frames)! } }
                : {}),
            })),
          },
        }
      : {}),
    ...(event.threads?.values
      ? {
          threads: {
            values: event.threads.values.map((thread) => ({
              ...pickDefined(thread, ['id', 'crashed', 'current']),
              ...(thread.stacktrace?.frames
                ? { stacktrace: { frames: safeFrames(thread.stacktrace.frames)! } }
                : {}),
            })),
          },
        }
      : {}),
  };
}
