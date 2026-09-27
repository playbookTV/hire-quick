import { SMILE_SDK_ERRORS, type SmileDiagnosticDetails } from '@hq/shared';
import type { Interceptor } from '@smileid/usesmileid';

type DiagnosticSink = (details: SmileDiagnosticDetails) => void;
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
const validStatus = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;

/** Read scalar diagnostics only. Never forward messages, causes, headers or bodies. */
export function smileSubmissionDetails(error: unknown): SmileDiagnosticDetails {
  const value = record(error);
  const status = value.statusCode ?? record(value.response).status;
  const typedCode = value.errorCode;
  let sdkError: string | undefined;
  if (typeof typedCode === 'string' && (SMILE_SDK_ERRORS as readonly string[]).includes(typedCode)) sdkError = typedCode;
  else if (validStatus(status)) sdkError = status === 401 ? 'NETWORK_UNAUTHORIZED'
    : status === 403 ? 'NETWORK_FORBIDDEN' : status === 404 ? 'NETWORK_NOT_FOUND'
      : status === 429 ? 'NETWORK_RATE_LIMIT' : status >= 500 ? 'NETWORK_SERVER_ERROR' : 'NETWORK_REQUEST_FAILED';
  else if (value.code === 'ECONNABORTED' || value.code === 'ETIMEDOUT') sdkError = 'NETWORK_TIMEOUT';
  else if (value.isAxiosError === true) sdkError = 'NETWORK_CONNECTION_FAILED';
  return { ...(sdkError ? { sdkError } : {}), ...(validStatus(status) ? { httpStatus: status } : {}) };
}

function notify(send: DiagnosticSink, details: SmileDiagnosticDetails): void {
  try { send(details); } catch { /* Diagnostics cannot change SDK outcomes. */ }
}

/** Installed after Smile's token-refresh interceptor; never changes or retries a request. */
export function smileSubmissionInterceptor(send: DiagnosticSink): Interceptor {
  return {
    attach(client) {
      client.interceptors.response.use(
        (response) => {
          // The SDK parses these four fields after Axios returns. Observe that
          // contract here so malformed 2xx responses report before Retry/Exit.
          const body = record(response.data);
          const fields = [body.job_id ?? body.jobId, body.user_id ?? body.userId, body.status, body.message];
          if (!fields.every((field) => typeof field === 'string'))
            notify(send, { sdkError: 'NETWORK_PARSE_ERROR', ...(validStatus(response.status) ? { httpStatus: response.status } : {}) });
          return response;
        },
        (error: unknown) => {
          notify(send, smileSubmissionDetails(error));
          throw error;
        },
      );
    },
  };
}
