import type { ErrorEvent, NodeOptions } from '@sentry/node';
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

/** Preserve diagnostic messages while excluding request/user data and arbitrary context. */
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  const smile = safeSmileTags(event.tags);
  const trace = event.contexts?.trace;
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
      'message',
    ]),
    ...(typeof trace?.trace_id === 'string' &&
    /^[a-f0-9]{32}$/.test(trace.trace_id) &&
    typeof trace.span_id === 'string' &&
    /^[a-f0-9]{16}$/.test(trace.span_id)
      ? { contexts: { trace: { trace_id: trace.trace_id, span_id: trace.span_id } } }
      : {}),
    tags: {
      ...Object.fromEntries(
        Object.entries(event.tags ?? {}).filter(([key]) =>
          ['service', 'code', 'job', 'reqId'].includes(key),
        ),
      ),
      ...smile,
    },
    ...(event.exception?.values
      ? {
          exception: {
            values: event.exception.values.map((exception) => ({
              ...pickDefined(exception, ['type', 'value']),
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

type StreamedSpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];
const jobs = new Set([
  'smileMonitoring',
  'autocomplete',
  'noshow',
  'reconcile',
  'commission',
  'checkouts',
  'resumeOps',
  'storageCleanup',
  'retentionPurge',
  'auditVerify',
]);

/** SDK v11 streams spans separately from errors; beforeSend does not scrub them. */
export function sanitizeSpan(span: StreamedSpan): StreamedSpan {
  const attributes = span.attributes ?? {};
  const http = attributes['hq.kind'] === 'http';
  const job = attributes['hq.kind'] === 'job';
  const method =
    typeof attributes['http.request.method'] === 'string' &&
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(attributes['http.request.method'])
      ? attributes['http.request.method']
      : 'OTHER';
  // Only our request middleware sets hq.route, using req.route.path (never a URL/baseUrl).
  const route =
    typeof attributes['hq.route'] === 'string' &&
    attributes['hq.route'].length <= 200 &&
    /^\/[a-zA-Z0-9_/:.-]*$/.test(attributes['hq.route'])
      ? attributes['hq.route']
      : 'unmatched';
  const jobName =
    typeof attributes['hq.job'] === 'string' && jobs.has(attributes['hq.job'])
      ? attributes['hq.job']
      : 'unknown';
  const name = http ? `${method} ${route}` : job ? `job ${jobName}` : 'operation';
  const status = attributes['http.response.status_code'];
  return {
    ...pickDefined(span, [
      'trace_id',
      'span_id',
      'parent_span_id',
      'start_timestamp',
      'end_timestamp',
      'is_segment',
    ]),
    status: span.status === 'error' ? 'error' : 'ok',
    name,
    attributes: {
      ...pickDefined(attributes, ['sentry.environment', 'sentry.release', 'sentry.sample_rate']),
      'sentry.op': http ? 'http.server' : job ? 'queue.task' : 'function',
      'sentry.origin': 'manual',
      'sentry.segment.name': name,
      ...(span.is_segment ? { 'sentry.segment.id': span.span_id } : {}),
      'sentry.trace_lifecycle': 'stream',
      ...(http
        ? {
            'service.name': 'hirequick-api',
            'http.request.method': method,
            'http.route': route,
            ...(typeof status === 'number' &&
            Number.isInteger(status) &&
            status >= 100 &&
            status <= 599
              ? { 'http.response.status_code': status }
              : {}),
            'hq.aborted': attributes['hq.aborted'] === true,
          }
        : {}),
      ...(job
        ? {
            'service.name': 'hirequick-worker',
            'hq.job': jobName,
            'hq.outcome': ['ok', 'alarm', 'error'].includes(String(attributes['hq.outcome']))
              ? attributes['hq.outcome']
              : 'unknown',
          }
        : {}),
    },
  };
}
