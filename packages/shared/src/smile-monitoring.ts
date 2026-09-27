/** Closed vocabulary: never pass provider payloads, identity fields or error messages. */
export const SMILE_DIAGNOSTICS = {
  SMILE_SESSION_FAILED: ['session', 'error'],
  SMILE_TOKEN_REFRESH_FAILED: ['token_refresh', 'error'],
  SMILE_CAPTURE_LOAD_FAILED: ['capture_load', 'error'],
  SMILE_CAPTURE_FAILED: ['capture_submission', 'error'],
  SMILE_RESULT_FETCH_FAILED: ['result_fetch', 'error'],
  SMILE_CALLBACK_FAILED: ['callback_processing', 'error'],
  SMILE_EVIDENCE_REFRESH_FAILED: ['evidence_refresh', 'error'],
  SMILE_INVALID_CALLBACK: ['callback', 'warning'],
  SMILE_PROVIDER_ERROR: ['provider_result', 'error'],
  SMILE_PROVIDER_ATTENTION: ['provider_result', 'warning'],
  SMILE_PROVIDER_REJECTED: ['provider_result', 'info'],
  SMILE_STALLED_ATTEMPTS: ['pending_attempts', 'warning'],
  SMILE_ADMIN_EVIDENCE_FAILED: ['admin_evidence', 'error'],
  SMILE_ADMIN_REVIEW_FAILED: ['admin_review', 'error'],
} as const;
export type SmileDiagnosticCode = keyof typeof SMILE_DIAGNOSTICS;

export const SMILE_SDK_ERRORS = [
  'NETWORK_CONNECTION_FAILED', 'NETWORK_TIMEOUT', 'NETWORK_REQUEST_FAILED',
  'NETWORK_PARSE_ERROR', 'NETWORK_UNAUTHORIZED', 'NETWORK_FORBIDDEN',
  'NETWORK_NOT_FOUND', 'NETWORK_RATE_LIMIT', 'NETWORK_SERVER_ERROR',
] as const;
export interface SmileDiagnosticDetails { sdkError?: unknown; httpStatus?: unknown }

export function safeSmileTags(tags: Record<string, unknown> = {}): Record<string, string> {
  if (typeof tags.code !== 'string' || !Object.hasOwn(SMILE_DIAGNOSTICS, tags.code)) return {};
  const code = tags.code as SmileDiagnosticCode;
  const result: Record<string, string> = { code, provider: 'smile_id', stage: SMILE_DIAGNOSTICS[code][0] };
  // Random attempt references are correlation handles, never account IDs or provider tokens.
  if (typeof tags.attempt === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tags.attempt))
    result.attempt = tags.attempt;
  if (typeof tags.sdk_error === 'string' && (SMILE_SDK_ERRORS as readonly string[]).includes(tags.sdk_error))
    result.sdk_error = tags.sdk_error;
  const status = typeof tags.http_status === 'string' && /^[1-5][0-9]{2}$/.test(tags.http_status)
    ? Number(tags.http_status) : tags.http_status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)
    result.http_status = String(status);
  return result;
}

/** Bounded deduplication; telemetry must never break verification or retry handling. */
export function createSmileReporter(
  send: (code: SmileDiagnosticCode, tags: Record<string, string>, level: 'error' | 'warning' | 'info') => void,
  now: () => number = Date.now,
) {
  const sent = new Map<string, number>();
  return (code: SmileDiagnosticCode, attempt?: string, details: SmileDiagnosticDetails = {}): void => {
    try {
      const tags = safeSmileTags({ code, attempt, sdk_error: details.sdkError, http_status: details.httpStatus });
      if (!tags.code) return;
      const key = `${code}:${tags.attempt ?? 'none'}:${tags.sdk_error ?? ''}:${tags.http_status ?? ''}`;
      const time = now();
      const previous = sent.get(key);
      if (previous !== undefined && time - previous < 15 * 60_000) return;
      if (sent.size >= 256) sent.delete(sent.keys().next().value!);
      sent.set(key, time);
      send(code, tags, SMILE_DIAGNOSTICS[code][1]);
    } catch { /* Reporting is best effort; the business outcome remains authoritative. */ }
  };
}
