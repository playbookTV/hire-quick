import { describe, expect, it, vi } from 'vitest';
import { AdminSessionChanged, createAdminSession, type AdminTokens } from '../session';

const BASE = 'https://admin-api.test';
const ADMIN: AdminTokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const EXPIRED = { error: { code: 'UNAUTHENTICATED', message: 'invalid or expired token' } };

interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** A session wired to in-memory storage and a scripted fetch that records every call. */
function harness(respond: (call: Call) => Response | Promise<Response>, saved: AdminTokens | null = null) {
  const store = { value: saved ? JSON.stringify({ version: 1, tokens: saved }) : null, legacyDiscarded: 0 };
  const calls: Call[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const call: Call = {
      path: String(input).slice(BASE.length),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return respond(call);
  });
  const session = createAdminSession({
    read: () => store.value,
    write: (value) => { store.value = value; },
    discardLegacy: () => { store.legacyDiscarded += 1; },
    fetch,
    baseUrl: BASE,
  });
  return {
    session,
    calls,
    store,
    paths: () => calls.map((call) => `${call.method} ${call.path}`),
    savedTokens: () => (JSON.parse(store.value ?? 'null') as { tokens: AdminTokens | null } | null)?.tokens ?? null,
    revoked: () => calls.filter((call) => call.path === '/auth/logout').map((call) => call.body),
  };
}

describe('admin sign-in', () => {
  it('signs in with a normalized email code and stores the session for later requests', async () => {
    const h = harness((call) => {
      if (call.path === '/auth/admin/otp/request') return json(200, { sent: true });
      if (call.path === '/auth/admin/otp/verify') return json(200, { ...ADMIN, user: { role: 'ADMIN' } });
      return json(200, { ok: true });
    });
    await expect(h.session.requestOtp('  Ops@HireQuick.Test ')).resolves.toEqual({ sent: true });
    await h.session.verify(' Ops@HireQuick.Test', '123456');

    expect(h.calls[0]?.body).toEqual({ email: 'ops@hirequick.test' });
    expect(h.calls[1]?.body).toEqual({ email: 'ops@hirequick.test', code: '123456' });
    expect(h.calls[1]?.headers.authorization).toBeUndefined();
    expect(h.session.getSnapshot().status).toBe('authed');
    expect(h.savedTokens()).toEqual(ADMIN);

    await h.session.request('/api/admin/stats');
    expect(h.calls[2]?.headers.authorization).toBe('Bearer access-1');
  });

  it('rejects a non-admin account and revokes the tokens it was issued', async () => {
    const h = harness((call) => call.path === '/auth/admin/otp/verify'
      ? json(200, { accessToken: 'client-access', refreshToken: 'client-refresh', user: { role: 'CLIENT' } })
      : json(204));
    await expect(h.session.verify('client@hirequick.test', '123456')).rejects.toThrow('This account is not an admin.');

    expect(h.session.getSnapshot().status).toBe('guest');
    expect(h.savedTokens()).toBeNull();
    expect(h.revoked()).toEqual([{ refreshToken: 'client-refresh' }]);
    await expect(h.session.request('/api/admin/stats')).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
  });

  it('drops a restored session whose account is no longer an admin', async () => {
    const h = harness((call) => (call.path === '/api/me' ? json(200, { role: 'USHER' }) : json(204)), ADMIN);
    await h.session.restore();

    expect(h.session.getSnapshot().status).toBe('guest');
    expect(h.savedTokens()).toBeNull();
    expect(h.paths()).toEqual(['GET /api/me', 'POST /auth/logout']);
    expect(h.revoked()).toEqual([{ refreshToken: 'refresh-1' }]);
    expect(h.store.legacyDiscarded).toBe(1);
  });
});

describe('token refresh', () => {
  it('refreshes once for concurrent 401s and retries each request with the new token', async () => {
    const h = harness((call) => {
      if (call.path === '/api/me') return json(200, { role: 'ADMIN' });
      if (call.path === '/auth/refresh') return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      return call.headers.authorization === 'Bearer access-2' ? json(200, { path: call.path }) : json(401, EXPIRED);
    }, ADMIN);
    await h.session.restore();

    const results = await Promise.all([
      h.session.request('/api/admin/stats'),
      h.session.request('/api/admin/disputes'),
    ]);

    expect(results).toEqual([{ path: '/api/admin/stats' }, { path: '/api/admin/disputes' }]);
    const refreshes = h.calls.filter((call) => call.path === '/auth/refresh');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(h.savedTokens()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('signs out when the refresh token itself is rejected', async () => {
    const h = harness((call) => (call.path === '/api/me' ? json(200, { role: 'ADMIN' }) : json(401, EXPIRED)), ADMIN);
    await h.session.restore();

    await expect(h.session.request('/api/admin/stats')).rejects.toMatchObject({ status: 401 });
    expect(h.paths()).toEqual(['GET /api/me', 'GET /api/admin/stats', 'POST /auth/refresh']);
    expect(h.session.getSnapshot().status).toBe('guest');
    expect(h.savedTokens()).toBeNull();
  });
});

describe('stale login generations', () => {
  it('discards a response that arrives after sign-out', async () => {
    const pending = deferred<Response>();
    const h = harness((call) => {
      if (call.path === '/api/me') return json(200, { role: 'ADMIN' });
      if (call.path === '/api/admin/stats') return pending.promise;
      return json(204);
    }, ADMIN);
    await h.session.restore();

    const inFlight = h.session.request('/api/admin/stats');
    await h.session.logout();
    pending.resolve(json(200, { escrowHeldKobo: 100 }));

    await expect(inFlight).rejects.toBeInstanceOf(AdminSessionChanged);
    expect(h.session.getSnapshot().status).toBe('guest');
  });

  it('revokes a slower sign-in that a newer sign-in superseded', async () => {
    const slowResponse = deferred<Response>();
    let verifies = 0;
    const h = harness((call) => {
      if (call.path !== '/auth/admin/otp/verify') return json(204);
      verifies += 1;
      return verifies === 1
        ? slowResponse.promise
        : json(200, { accessToken: 'access-new', refreshToken: 'refresh-new', user: { role: 'ADMIN' } });
    });

    const slow = h.session.verify('ops@hirequick.test', '111111');
    await h.session.verify('ops@hirequick.test', '222222');
    slowResponse.resolve(json(200, { accessToken: 'access-old', refreshToken: 'refresh-old', user: { role: 'ADMIN' } }));

    await expect(slow).rejects.toBeInstanceOf(AdminSessionChanged);
    expect(h.revoked()).toEqual([{ refreshToken: 'refresh-old' }]);
    expect(h.savedTokens()).toEqual({ accessToken: 'access-new', refreshToken: 'refresh-new' });
    expect(h.session.getSnapshot().status).toBe('authed');
  });

  it('revokes tokens from a refresh that finishes after sign-out', async () => {
    const refresh = deferred<Response>();
    const h = harness((call) => {
      if (call.path === '/api/me') return json(200, { role: 'ADMIN' });
      if (call.path === '/auth/refresh') return refresh.promise;
      if (call.path === '/auth/logout') return json(204);
      return json(401, EXPIRED);
    }, ADMIN);
    await h.session.restore();

    const inFlight = h.session.request('/api/admin/stats');
    await vi.waitFor(() => expect(h.paths()).toContain('POST /auth/refresh'));
    await h.session.logout();
    refresh.resolve(json(200, { accessToken: 'access-late', refreshToken: 'refresh-late' }));

    await expect(inFlight).rejects.toBeInstanceOf(AdminSessionChanged);
    expect(h.revoked()).toEqual([{ refreshToken: 'refresh-1' }, { refreshToken: 'refresh-late' }]);
    expect(h.savedTokens()).toBeNull();
    expect(h.session.getSnapshot().status).toBe('guest');
  });
});
