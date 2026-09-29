import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE = 'https://admin-api.test';
const EXPIRED = { error: { code: 'UNAUTHENTICATED', message: 'invalid or expired token' } };
const REFUND = { bookingId: 'booking-1', amountKobo: 150_000, reason: 'client cancelled' };

interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function memoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

/** Load a fresh api module against browser-like globals, restored as a signed-in admin. */
async function signedInApi(respond: (call: Call) => Response) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', BASE);
  const session = memoryStorage({
    hq_admin_session: JSON.stringify({ version: 1, tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' } }),
  });
  const legacy = memoryStorage({ hq_admin_token: 'legacy-token' });
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('localStorage', legacy);
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const call: Call = {
      path: String(input).slice(BASE.length),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return call.path === '/api/me' ? json(200, { role: 'ADMIN' }) : respond(call);
  }));
  const module = await import('../api');
  await module.adminSession.restore();
  expect(module.adminSession.getSnapshot().status).toBe('authed');
  expect(legacy.getItem('hq_admin_token')).toBeNull();
  return { ...module, calls, session };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('api()', () => {
  it('sends the caller’s idempotency key on a money call and reuses it on the refreshed retry', async () => {
    const { api, calls } = await signedInApi((call) => {
      if (call.path === '/auth/refresh') return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      return call.headers.authorization === 'Bearer access-2' ? json(200, { executed: false }) : json(401, EXPIRED);
    });

    await expect(api('/api/admin/refunds', { method: 'POST', body: REFUND, idempotencyKey: 'refund-key-1' }))
      .resolves.toEqual({ executed: false });

    const refunds = calls.filter((call) => call.path === '/api/admin/refunds');
    expect(refunds.map((call) => [call.headers.authorization, call.headers['idempotency-key']])).toEqual([
      ['Bearer access-1', 'refund-key-1'],
      ['Bearer access-2', 'refund-key-1'],
    ]);
    expect(refunds.map((call) => call.body)).toEqual([REFUND, REFUND]);
  });

  it('sends no idempotency key when the caller does not supply one', async () => {
    const { api, calls } = await signedInApi(() => json(200, { escrowHeldKobo: 0 }));
    await api('/api/admin/stats');
    expect(calls.at(-1)?.headers).not.toHaveProperty('idempotency-key');
  });

  it('retries at most once: a second 401 signs out instead of refreshing again', async () => {
    const { api, adminSession, calls, session } = await signedInApi((call) =>
      call.path === '/auth/refresh'
        ? json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' })
        : json(401, EXPIRED));

    await expect(api('/api/admin/refunds', { method: 'POST', body: REFUND, idempotencyKey: 'refund-key-2' }))
      .rejects.toMatchObject({ status: 401 });

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /api/me',
      'POST /api/admin/refunds',
      'POST /auth/refresh',
      'POST /api/admin/refunds',
    ]);
    expect(adminSession.getSnapshot().status).toBe('guest');
    expect(JSON.parse(session.getItem('hq_admin_session') ?? 'null')).toEqual({ version: 1, tokens: null });
  });
});
