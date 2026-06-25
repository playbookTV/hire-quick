/**
 * The single HTTP entry point to the HireQuick API.
 *
 * Responsibilities:
 *  - attach `Authorization: Bearer <access>` and a correlation `x-request-id`
 *  - thread an `Idempotency-Key` on money-mutating calls, held STABLE across the
 *    401 auto-retry (re-sending a new key would defeat idempotency)
 *  - single-flight refresh: on a 401, one `/auth/refresh` runs while concurrent
 *    callers await it, then each retries its request once with the new token
 *  - parse the `{ error: { code, message, issues? } }` envelope into ApiError
 */
import { env } from './env.js';
import { getTokens, saveTokens, clearTokens, type TokenPair } from './tokens.js';
import { toApiError, ApiError } from './api-error.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-serializable body. */
  body?: unknown;
  /** Send the bearer token (default true). Set false for auth endpoints. */
  auth?: boolean;
  /** Money paths require this; it is reused verbatim on the auto-retry. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** Called when refresh fails — auth-context wires this to force a logout. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

let refreshPromise: Promise<string | null> | null = null;

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

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Run the refresh once; concurrent callers share the in-flight promise. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const tokens = await getTokens();
    if (!tokens) return null;
    try {
      const res = await fetch(`${env.API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId() },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        await clearTokens();
        onUnauthorized?.();
        return null;
      }
      const pair = (await res.json()) as TokenPair;
      await saveTokens(pair);
      return pair.accessToken;
    } catch {
      // Network error during refresh — leave tokens, surface as failure.
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function send(path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': requestId(),
  };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  if (opts.auth !== false && accessToken) headers['authorization'] = `Bearer ${accessToken}`;

  return fetch(`${env.API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  const tokens = useAuth ? await getTokens() : null;

  let res = await send<T>(path, opts, tokens?.accessToken ?? null);

  // One refresh + retry on an expired access token.
  if (res.status === 401 && useAuth && tokens) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await send<T>(path, opts, fresh);
    }
  }

  const body = await parseBody(res);
  if (!res.ok) {
    throw toApiError(res.status, body, res.headers.get('x-request-id') ?? undefined);
  }
  return body as T;
}

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
