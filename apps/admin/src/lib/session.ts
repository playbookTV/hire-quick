export interface AdminTokens { accessToken: string; refreshToken: string }
export interface AdminSessionState { status: 'loading' | 'authed' | 'guest' | 'unavailable'; message: string | null }
export interface AdminRequestOptions {
  method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal;
}
export class AdminApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly uncertain = false) { super(message); }
}
export class AdminSessionChanged extends Error {
  constructor() { super('Your admin session changed. Sign in again before continuing.'); }
}
function pair(value: unknown): AdminTokens {
  if (!value || typeof value !== 'object' || !('accessToken' in value) || !('refreshToken' in value)
    || typeof value.accessToken !== 'string' || !value.accessToken || typeof value.refreshToken !== 'string' || !value.refreshToken) {
    throw new Error('The server returned an incomplete session. Sign in again.');
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}
async function bodyOf(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
function apiError(response: Response, body: unknown, uncertain = false): AdminApiError {
  const envelope = body as { error?: { code?: string; message?: string } } | null;
  return new AdminApiError(response.status, envelope?.error?.code ?? 'HTTP_ERROR',
    uncertain ? 'The outcome is unconfirmed. Reload the latest records before deciding again.'
      : envelope?.error?.message ?? `Request failed (${response.status}).`, uncertain);
}

/** Admin sessions live for this browser tab and renew only within their login generation. */
export function createAdminSession(deps: {
  read(): string | null; write(value: string): void; discardLegacy(): void;
  fetch: typeof fetch; baseUrl: string;
}) {
  let state: AdminSessionState = { status: 'loading', message: null };
  let tokens: AdminTokens | null = null;
  let generation = 0;
  let operation = 0;
  let dirty = false;
  let refreshFlight: { generation: number; promise: Promise<AdminTokens> } | null = null;
  const listeners = new Set<() => void>();
  const setState = (status: AdminSessionState['status'], message: string | null = null): void => {
    state = { status, message }; for (const listener of listeners) listener();
  };
  const assertCurrent = (expected: number): void => { if (generation !== expected) throw new AdminSessionChanged(); };
  const persist = (): void => { deps.write(JSON.stringify({ version: 1, tokens })); dirty = false; };
  const send = (path: string, method: string, body: string | undefined, access: string | null, key?: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return deps.fetch(`${deps.baseUrl}${path}`, { method, headers: {
      'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    }, ...(body === undefined ? {} : { body }), ...(signal ? { signal } : {}) });
  };
  const revoke = async (refreshToken: string): Promise<void> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    try { await send('/auth/logout', 'POST', JSON.stringify({ refreshToken }), null, undefined, abort.signal); }
    catch { /* Revocation is best effort; local fencing happens first. */ }
    finally { clearTimeout(timer); }
  };
  const end = (expected: number): AdminTokens | null => {
    assertCurrent(expected);
    const captured = tokens;
    generation += 1; operation += 1; tokens = null; dirty = true;
    try { persist(); setState('guest'); }
    catch { setState('unavailable', 'We couldn’t finish signing out in this browser. Try again.'); }
    return captured;
  };
  const refresh = (expected: number, original: AdminTokens, signal?: AbortSignal): Promise<AdminTokens> => {
    assertCurrent(expected);
    if (refreshFlight?.generation === expected) return refreshFlight.promise;
    const promise = (async () => {
      if (!tokens) throw new AdminSessionChanged();
      if (dirty) persist();
      if (tokens.refreshToken !== original.refreshToken) return tokens;
      const response = await send('/auth/refresh', 'POST', JSON.stringify({ refreshToken: original.refreshToken }), null, undefined, signal);
      const body = await bodyOf(response).catch(() => undefined);
      if (!response.ok) {
        assertCurrent(expected);
        if (response.status === 401) end(expected);
        throw apiError(response, body);
      }
      const next = pair(body);
      if (generation !== expected) { await revoke(next.refreshToken); throw new AdminSessionChanged(); }
      tokens = next; dirty = true; persist();
      return next;
    })().finally(() => { if (refreshFlight?.generation === expected) refreshFlight = null; });
    refreshFlight = { generation: expected, promise };
    return promise;
  };
  const request = async <T>(path: string, opts: AdminRequestOptions = {}): Promise<T> => {
    const expected = generation;
    const original = tokens;
    if (!original) throw new AdminApiError(401, 'SESSION_REQUIRED', 'Sign in before continuing.');
    if (dirty) persist();
    const method = opts.method ?? 'GET';
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const mutating = method !== 'GET' && method !== 'HEAD';
    let response: Response;
    try { response = await send(path, method, body, original.accessToken, opts.idempotencyKey, opts.signal); }
    catch {
      assertCurrent(expected);
      throw new AdminApiError(0, 'NETWORK', mutating ? 'The outcome is unconfirmed. Reload the latest records before deciding again.' : 'Couldn’t connect. Try again.', mutating);
    }
    assertCurrent(expected);
    if (response.status === 401) {
      // Authentication rejected the first request before its handler ran.
      const next = await refresh(expected, original, opts.signal);
      assertCurrent(expected);
      try { response = await send(path, method, body, next.accessToken, opts.idempotencyKey, opts.signal); }
      catch {
        assertCurrent(expected);
        throw new AdminApiError(0, 'NETWORK', 'The outcome is unconfirmed. Reload the latest records before deciding again.', mutating);
      }
    }
    let result: unknown;
    try { result = await bodyOf(response); }
    catch {
      assertCurrent(expected);
      if (response.status === 401) {
        end(expected);
        throw new AdminApiError(401, 'SESSION_EXPIRED', 'Your admin session expired. Sign in again.');
      }
      throw new AdminApiError(0, 'RESPONSE_UNAVAILABLE', 'Couldn’t confirm the response. Reload the latest records before deciding again.', mutating);
    }
    assertCurrent(expected);
    if (!response.ok) {
      if (response.status === 401) end(expected);
      throw apiError(response, result, mutating && response.status >= 500);
    }
    return result as T;
  };
  return {
    request,
    getSnapshot: () => state,
    subscribe(this: void, listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async restore(this: void): Promise<void> {
      const run = ++operation;
      const expected = generation;
      setState('loading');
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 8000);
      try {
        deps.discardLegacy();
        if (dirty) persist();
        const saved = deps.read();
        const envelope = saved ? JSON.parse(saved) as { version?: number; tokens?: unknown } : null;
        tokens = envelope?.version === 1 && envelope.tokens ? pair(envelope.tokens) : null;
        if (!tokens) { if (run === operation) setState('guest'); return; }
        const me = await request<{ role: string }>('/api/me', { signal: abort.signal });
        if (run !== operation || generation !== expected) return;
        if (me.role !== 'ADMIN') { const invalid = end(expected); if (invalid) await revoke(invalid.refreshToken); return; }
        setState('authed');
      } catch {
        if (run === operation && generation === expected) setState('unavailable', 'Couldn’t restore your admin session. Check your connection and try again.');
      } finally { clearTimeout(timer); }
    },
    async requestOtp(this: void, email: string): Promise<{ sent: true }> {
      const response = await send('/auth/admin/otp/request', 'POST', JSON.stringify({ email: email.trim().toLowerCase() }), null);
      const result = await bodyOf(response);
      if (!response.ok) throw apiError(response, result);
      return result as { sent: true };
    },
    async verify(this: void, email: string, code: string): Promise<void> {
      const previous = tokens;
      const expected = ++generation;
      const run = ++operation;
      tokens = null;
      dirty = true;
      // Retire the previous login durably before dispatching its replacement.
      // Keep a dirty tombstone on storage failure so restore cannot reload it.
      if (previous) void revoke(previous.refreshToken);
      try { persist(); setState('guest'); }
      catch (error) {
        setState('unavailable', 'Couldn’t clear your previous admin session. Try again.');
        throw error;
      }
      const response = await send('/auth/admin/otp/verify', 'POST', JSON.stringify({ email: email.trim().toLowerCase(), code }), null);
      const result = await bodyOf(response);
      if (!response.ok) { assertCurrent(expected); throw apiError(response, result); }
      const next = pair(result);
      const role = (result as { user?: { role?: string } }).user?.role;
      if (generation !== expected || run !== operation) { await revoke(next.refreshToken); throw new AdminSessionChanged(); }
      if (role !== 'ADMIN') { await revoke(next.refreshToken); throw new Error('This account is not an admin.'); }
      tokens = next; dirty = true;
      try { persist(); setState('authed'); }
      catch (error) { setState('unavailable', 'Couldn’t save your admin session. Try again.'); throw error; }
    },
    async logout(this: void): Promise<void> { const old = end(generation); if (old) await revoke(old.refreshToken); },
  };
}
