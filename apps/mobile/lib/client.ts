/** Session-bound HTTP client; money retries keep their original idempotency key. */
import { env } from './env.js';
import { sessionStore } from './tokens.js';
import { createHttpClient, type RequestOptions } from './http-client.js';
import { ApiError } from './api-error.js';

export type { RequestOptions } from './http-client.js';

/** RFC4122-ish v4 id for request correlation (not security-sensitive). */
function requestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function newIdempotencyKey(): string {
  return `idem_${requestId()}`;
}

const transport: typeof fetch = async (...args) => {
  const [url, options] = args;
  const traceOtp = __DEV__ && typeof url === 'string' && url.endsWith('/auth/otp/request');
  if (traceOtp) console.info('[auth:otp] request', options?.method ?? 'GET', url);
  try {
    const response = await fetch(...args);
    if (traceOtp) {
      console.info('[auth:otp] response', response.status, 'requestId:', response.headers.get('x-request-id'));
    }
    return response;
  } catch (error) {
    if (traceOtp) console.info('[auth:otp] request failed before receiving a response');
    throw error;
  }
};

const client = createHttpClient(env.API_URL, sessionStore, transport, requestId);
export const request = client.request;
export const setUnauthorizedHandler = client.setUnauthorizedHandler;
export const revokeRefreshToken = client.revoke;

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

export { ApiError };
