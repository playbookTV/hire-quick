import { ApiError, toApiError } from './api-error.js';
import { assertNotAborted } from './abort.js';
import { SessionChanged, tokenPairSchema, type SessionSnapshot, type SessionStore, type TokenPair } from './session-store.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

export function createHttpClient(baseUrl: string, sessions: SessionStore, transport: typeof fetch, makeId: () => string) {
  let onUnauthorized: ((generation: number, persistenceFailed: boolean) => void) | null = null;
  const refreshes = new Map<number, Promise<TokenPair>>();
  const assertCurrent = (generation: number): void => {
    if (!sessions.isCurrent(generation)) throw new SessionChanged();
  };
  const send = (path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> => {
    assertNotAborted(opts.signal);
    const headers: Record<string, string> = { accept: 'application/json', 'x-request-id': makeId() };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    if (opts.auth !== false && accessToken) headers.authorization = `Bearer ${accessToken}`;
    return transport(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET', headers,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  };
  const revoke = async (refreshToken: string): Promise<void> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      await send('/auth/logout', { method: 'POST', auth: false, body: { refreshToken }, signal: abort.signal }, null);
    } catch {
      // Local fencing does not depend on a reachable logout endpoint.
    } finally { clearTimeout(timer); }
  };
  const refresh = (snapshot: SessionSnapshot, signal?: AbortSignal): Promise<TokenPair> => {
    const existing = refreshes.get(snapshot.generation);
    if (existing) return existing;
    const pending = (async () => {
      const current = await sessions.snapshot();
      assertCurrent(snapshot.generation);
      if (!current.tokens) throw new SessionChanged();
      if (current.tokens.refreshToken !== snapshot.tokens?.refreshToken) return current.tokens;
      const response = await send('/auth/refresh', {
        method: 'POST', auth: false, body: { refreshToken: current.tokens.refreshToken },
        ...(signal ? { signal } : {}),
      }, null);
      const body = await parseBody(response);
      if (!response.ok) {
        assertCurrent(snapshot.generation);
        if (response.status === 401) {
          const ended = sessions.end(snapshot.generation);
          try {
            await ended.completion;
            if (sessions.isCurrent(ended.generation)) onUnauthorized?.(ended.generation, false);
          } catch (error) {
            if (sessions.isCurrent(ended.generation)) onUnauthorized?.(ended.generation, true);
            throw error;
          }
        }
        throw toApiError(response.status, body);
      }
      const pair = tokenPairSchema.parse(body);
      if (!sessions.isCurrent(snapshot.generation)) {
        await revoke(pair.refreshToken);
        throw new SessionChanged();
      }
      return sessions.update(current, pair);
    })().finally(() => refreshes.delete(snapshot.generation));
    refreshes.set(snapshot.generation, pending);
    return pending;
  };
  return {
    setUnauthorizedHandler(this: void, handler: typeof onUnauthorized): void { onUnauthorized = handler; },
    revoke,
    async request<T = unknown>(this: void, path: string, opts: RequestOptions = {}): Promise<T> {
      const snapshot = opts.auth === false ? null : await sessions.snapshot();
      let response = await send(path, opts, snapshot?.tokens?.accessToken ?? null);
      if (snapshot) assertCurrent(snapshot.generation);
      if (response.status === 401 && snapshot?.tokens) {
        const pair = await refresh(snapshot, opts.signal);
        assertCurrent(snapshot.generation);
        response = await send(path, opts, pair.accessToken);
      }
      const body = await parseBody(response);
      if (snapshot) assertCurrent(snapshot.generation);
      if (!response.ok) throw toApiError(response.status, body, response.headers.get('x-request-id') ?? undefined);
      return body as T;
    },
  };
}

export { ApiError };
