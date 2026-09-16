import { describe, expect, it, vi } from 'vitest';
import { createAdminSession, AdminApiError, AdminSessionChanged } from '../../../../../admin/src/lib/session.js';
import { createApprovalActions } from '../../../../../admin/src/lib/approval-actions.js';

const first = { accessToken: 'access-a', refreshToken: 'refresh-a' };
const rotated = { accessToken: 'access-a2', refreshToken: 'refresh-a2' };
const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const denied = () => ok({ error: { code: 'INVALID_REFRESH', message: 'expired' } }, 401);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function setup(fetch: typeof globalThis.fetch, saved: string | null = JSON.stringify({ version: 1, tokens: first })) {
  let disk = saved;
  const write = vi.fn((value: string) => { disk = value; });
  const discardLegacy = vi.fn();
  const session = createAdminSession({ fetch, baseUrl: 'https://example.test', read: () => disk, write, discardLegacy });
  return { session, write, discardLegacy, saved: () => disk && JSON.parse(disk) };
}
const endpoint = (url: unknown, path: string) => String(url).endsWith(path);

describe('admin session lifecycle and checker expiry', () => {
  it('returns access-only legacy sessions to login without trusting their token', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const { session, discardLegacy } = setup(fetch, null);
    await session.restore();
    expect(discardLegacy).toHaveBeenCalledOnce();
    expect(session.getSnapshot().status).toBe('guest');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('recovers legacy-storage rejection without crashing module initialization', async () => {
    const { session, discardLegacy } = setup(async () => ok({ role: 'ADMIN' }));
    discardLegacy.mockImplementationOnce(() => { throw new Error('storage denied'); });
    await session.restore();
    expect(session.getSnapshot().status).toBe('unavailable');
    await session.restore();
    expect(session.getSnapshot().status).toBe('authed');
  });

  it('validates restored admin role and revokes non-admin sessions', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => endpoint(url, '/auth/logout') ? new Response(null, { status: 204 }) : ok({ role: 'USHER' }));
    const { session, saved } = setup(fetch);
    await session.restore();
    expect(session.getSnapshot().status).toBe('guest');
    expect(saved().tokens).toBeNull();
    expect(fetch).toHaveBeenCalledWith('https://example.test/auth/logout', expect.objectContaining({ body: JSON.stringify({ refreshToken: first.refreshToken }) }));
  });

  it('preserves credentials during transient restore failure and retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ok({ role: 'ADMIN' }));
    const { session, saved } = setup(fetch);
    await session.restore();
    expect(session.getSnapshot().status).toBe('unavailable');
    expect(saved().tokens).toEqual(first);
    await session.restore();
    expect(session.getSnapshot().status).toBe('authed');
  });

  it('renews once during a checker decision and preserves exact body/key across the401 retry', async () => {
    let decisions = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, opts) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) return ok(rotated);
      if (new Headers(opts?.headers).get('authorization') === 'Bearer access-a') return denied();
      decisions += 1; return ok({ approved: true });
    });
    const { session, saved } = setup(fetch);
    await session.restore();
    const body = { decision: 'approve' };
    const result = session.request('/api/admin/approvals/a', { method: 'POST', body, idempotencyKey: 'checker-key' });
    body.decision = 'reject';
    await expect(result).resolves.toEqual({ approved: true });
    expect(decisions).toBe(1);
    const calls = fetch.mock.calls.filter(([url]) => endpoint(url, '/api/admin/approvals/a'));
    expect(calls).toHaveLength(2);
    expect(calls.map(([, opts]) => opts?.body)).toEqual(['{"decision":"approve"}', '{"decision":"approve"}']);
    expect(calls.every(([, opts]) => new Headers(opts?.headers).get('idempotency-key') === 'checker-key')).toBe(true);
    expect(saved().tokens).toEqual(rotated);
  });

  it('refresh failure invalidates login before any checker decision can execute', async () => {
    let decisions = 0;
    const { session } = setup(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) return denied();
      decisions += 1; return denied();
    });
    await session.restore();
    await expect(session.request('/api/admin/approvals/a', { method: 'POST', body: { decision: 'approve' } })).rejects.toMatchObject({ status: 401 });
    expect(session.getSnapshot().status).toBe('guest');
    expect(decisions).toBe(1); // rejected pre-handler request only; no replay
  });

  it('refresh503 is recoverable and never replays the checker mutation until refresh succeeds', async () => {
    let refreshes = 0;
    let decisions = 0;
    const { session, saved } = setup(async (url, opts) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) return ++refreshes === 1 ? ok({}, 503) : ok(rotated);
      if (new Headers(opts?.headers).get('authorization') === 'Bearer access-a') return denied();
      decisions += 1; return ok({ approved: true });
    });
    await session.restore();
    await expect(session.request('/api/admin/approvals/a', { method: 'POST' })).rejects.toMatchObject({ status: 503, uncertain: false });
    expect(decisions).toBe(0);
    expect(saved().tokens).toEqual(first);
    await session.request('/api/admin/approvals/a', { method: 'POST' });
    expect(decisions).toBe(1);
  });

  it.each(['network', 'server', 'body'] as const)('never automatically retries a mutation with an uncertain %s outcome', async (failure) => {
    let decisions = 0;
    const { session } = setup(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      decisions += 1;
      if (failure === 'network') throw new Error('lost response');
      if (failure === 'body') return new Response('broken json', { status: 200 });
      return ok({}, 500);
    });
    await session.restore();
    await expect(session.request('/api/admin/approvals/a', { method: 'POST' })).rejects.toMatchObject({ uncertain: true });
    expect(decisions).toBe(1);
  });

  it('fences logout during refresh and revokes both captured and stale returned tokens', async () => {
    const refreshing = deferred<Response>();
    const started = deferred<void>();
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) { started.resolve(); return refreshing.promise; }
      if (endpoint(url, '/auth/logout')) return new Response(null, { status: 204 });
      return denied();
    });
    const { session, saved } = setup(fetch);
    await session.restore();
    const decision = session.request('/api/admin/approvals/a', { method: 'POST' }).catch((error: unknown) => error);
    await started.promise;
    await session.logout();
    refreshing.resolve(ok(rotated));
    expect(await decision).toBeInstanceOf(AdminSessionChanged);
    expect(saved().tokens).toBeNull();
    expect(session.getSnapshot().status).toBe('guest');
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/auth/logout')).map(([, opts]) => opts?.body))
      .toEqual([JSON.stringify({ refreshToken: first.refreshToken }), JSON.stringify({ refreshToken: rotated.refreshToken })]);
  });

  it('does not accept a stale401 after a new admin login', async () => {
    const stale = deferred<Response>();
    const started = deferred<void>();
    const next = { accessToken: 'access-b', refreshToken: 'refresh-b', user: { role: 'ADMIN' } };
    const { session, saved } = setup(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/otp/verify')) return ok(next);
      started.resolve(); return stale.promise;
    });
    await session.restore();
    const old = session.request('/api/admin/approvals/a', { method: 'POST' }).catch((error: unknown) => error);
    await started.promise;
    await session.verify('admin-b', '123456');
    stale.resolve(denied());
    expect(await old).toBeInstanceOf(AdminSessionChanged);
    expect(session.getSnapshot().status).toBe('authed');
    expect(saved().tokens.refreshToken).toBe('refresh-b');
  });

  it('retains a rotated pair after storage rejection and retries its persistence', async () => {
    const { session, write, saved } = setup(async (url, opts) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) return ok(rotated);
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a' ? denied() : ok({ approved: true });
    });
    await session.restore();
    write.mockImplementationOnce(() => { throw new Error('storage denied'); });
    await expect(session.request('/api/admin/approvals/a', { method: 'POST' })).rejects.toThrow('storage denied');
    await expect(session.request('/api/admin/approvals/a', { method: 'POST' })).resolves.toEqual({ approved: true });
    expect(saved().tokens).toEqual(rotated);
  });

  it('shares one refresh across simultaneous expired requests', async () => {
    const refreshing = deferred<Response>();
    const started = deferred<void>();
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, opts) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/refresh')) { started.resolve(); return refreshing.promise; }
      return new Headers(opts?.headers).get('authorization') === 'Bearer access-a' ? denied() : ok({ approved: true });
    });
    const { session } = setup(fetch);
    await session.restore();
    const a = session.request('/api/admin/approvals/a', { method: 'POST' });
    const b = session.request('/api/admin/approvals/b', { method: 'POST' });
    await started.promise;
    refreshing.resolve(ok(rotated));
    await Promise.all([a, b]);
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/auth/refresh'))).toHaveLength(1);
  });

  it('rejects and revokes a non-admin OTP token pair', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => endpoint(url, '/auth/logout')
      ? new Response(null, { status: 204 }) : ok({ ...first, user: { role: 'CLIENT' } }));
    const { session, saved } = setup(fetch, null);
    await session.restore();
    await expect(session.verify('client', '123456')).rejects.toThrow('not an admin');
    expect(saved().tokens).toBeNull();
    expect(session.getSnapshot().status).toBe('guest');
    expect(fetch).toHaveBeenCalledWith('https://example.test/auth/logout', expect.objectContaining({ body: JSON.stringify({ refreshToken: first.refreshToken }) }));
  });

  it.each(['invalid-otp', 'network', 'non-admin'] as const)('never restores the previous login after a failed %s replacement', async (failure) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/logout')) return new Response(null, { status: 204 });
      if (failure === 'network') throw new Error('offline');
      if (failure === 'invalid-otp') return ok({ error: { code: 'INVALID_OTP', message: 'bad code' } }, 401);
      return ok({ ...rotated, user: { role: 'CLIENT' } });
    });
    const { session, saved } = setup(fetch);
    await session.restore();
    await expect(session.verify('replacement', '123456')).rejects.toThrow();
    expect(saved().tokens).toBeNull();
    expect(session.getSnapshot().status).toBe('guest');
    await session.restore();
    expect(session.getSnapshot().status).toBe('guest');
    const reloaded = setup(fetch, JSON.stringify(saved()));
    await reloaded.session.restore();
    expect(reloaded.session.getSnapshot().status).toBe('guest');
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/api/me'))).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith('https://example.test/auth/logout', expect.objectContaining({ body: JSON.stringify({ refreshToken: first.refreshToken }) }));
  });

  it('does not dispatch a replacement login until its tombstone is persisted', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/logout')) return new Response(null, { status: 204 });
      return ok({ ...rotated, user: { role: 'ADMIN' } });
    });
    const { session, write, saved } = setup(fetch);
    await session.restore();
    write.mockImplementationOnce(() => { throw new Error('storage denied'); });
    await expect(session.verify('replacement', '123456')).rejects.toThrow('storage denied');
    expect(session.getSnapshot().status).toBe('unavailable');
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/auth/otp/verify'))).toHaveLength(0);
    // A repeated storage failure keeps restoration unavailable and does not read
    // the stale pair that is still on disk.
    write.mockImplementationOnce(() => { throw new Error('storage denied'); });
    await session.restore();
    expect(session.getSnapshot().status).toBe('unavailable');
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/api/me'))).toHaveLength(1);
    await session.restore();
    expect(saved().tokens).toBeNull();
    expect(session.getSnapshot().status).toBe('guest');
    await session.verify('replacement', '123456');
    expect(session.getSnapshot().status).toBe('authed');
    expect(saved().tokens).toEqual(rotated);
    expect(fetch.mock.calls.filter(([url]) => endpoint(url, '/auth/otp/verify'))).toHaveLength(1);
  });

  it('does not surface a late successful decision after logout', async () => {
    const decision = deferred<Response>();
    const { session } = setup(async (url) => {
      if (endpoint(url, '/api/me')) return ok({ role: 'ADMIN' });
      if (endpoint(url, '/auth/logout')) return new Response(null, { status: 204 });
      return decision.promise;
    });
    await session.restore();
    const pending = session.request('/api/admin/approvals/a', { method: 'POST' }).catch((error: unknown) => error);
    await session.logout();
    decision.resolve(ok({ approved: true }));
    expect(await pending).toBeInstanceOf(AdminSessionChanged);
    expect(session.getSnapshot().status).toBe('guest');
  });
});

describe('checker action controls', () => {
  it('suppresses concurrent clicks while renewal/decision is in flight', async () => {
    const pending = deferred<unknown>();
    const send = vi.fn(() => pending.promise);
    const actions = createApprovalActions(send, async () => true);
    const firstDecision = actions.submit('a', 'approve');
    await actions.submit('a', 'reject');
    expect(actions.disabled('a')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    pending.resolve({ approved: true });
    await firstDecision;
  });

  it('requires a successful fresh reload before an uncertain decision can be retried', async () => {
    const send = vi.fn().mockRejectedValueOnce(new AdminApiError(500, 'INTERNAL', 'unknown', true)).mockResolvedValue({ approved: true });
    const reload = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const actions = createApprovalActions(send, reload);
    await expect(actions.submit('a', 'approve')).rejects.toMatchObject({ uncertain: true });
    await actions.submit('a', 'approve');
    expect(send).toHaveBeenCalledTimes(1);
    await actions.reload();
    expect(actions.disabled('a')).toBe(true);
    await actions.reload();
    expect(actions.disabled('a')).toBe(false);
    await actions.submit('a', 'approve');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
