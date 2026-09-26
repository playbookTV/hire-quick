import { describe, expect, it, vi } from 'vitest';
import { createAdminSession } from '../../../../../admin/src/lib/session.js';
import { createHttpClient } from '../../../../../mobile/lib/http-client.js';
import { createSessionStore } from '../../../../../mobile/lib/session-store.js';

const original = { accessToken: 'old-admin', refreshToken: 'refresh-admin' };
const refreshed = { accessToken: 'current-client', refreshToken: 'refresh-client' };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const roleChanged = () => response({ error: { code: 'ROLE_CHANGED', message: 'Sign in again.' } }, 401);
const forbidden = () => response({ error: { code: 'FORBIDDEN', message: 'insufficient role' } }, 403);

/** Transport fixtures exercise the actual clients; middleware enforcement has its own tests. */
describe('clients recover once from a rejected stale-role token', () => {
  it.each(['admin', 'mobile'] as const)('%s retries a protected mutation with current authority and stops at403', async (client) => {
    const calls: Array<{ path: string; access: string | null; body: NonNullable<Parameters<typeof fetch>[1]>['body']; key: string | null }> = [];
    const transport = vi.fn<typeof fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname;
      const headers = new Headers(options?.headers);
      calls.push({ path, access: headers.get('authorization'), body: options?.body, key: headers.get('idempotency-key') });
      if (path === '/api/me') return response({ role: 'ADMIN' });
      if (path === '/auth/refresh') return response(refreshed);
      return headers.get('authorization') === 'Bearer old-admin' ? roleChanged() : forbidden();
    });
    let disk = JSON.stringify({ version: 1, tokens: original });
    const request = client === 'admin'
      ? await (async () => {
        const session = createAdminSession({
          baseUrl: 'https://example.test', fetch: transport,
          read: () => disk, write: (value) => { disk = value; }, discardLegacy: () => {},
        });
        await session.restore();
        return () => session.request('/api/admin/approvals/a', {
          method: 'POST', body: { decision: 'approve' }, idempotencyKey: 'same-decision',
        });
      })()
      : (() => {
        const store = createSessionStore({ read: async () => disk, write: async (value) => { disk = value; } });
        const http = createHttpClient('https://example.test', store, transport, () => 'request-id');
        return () => http.request('/api/admin/approvals/a', {
          method: 'POST', body: { decision: 'approve' }, idempotencyKey: 'same-decision',
        });
      })();

    await expect(request()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1);
    const attempts = calls.filter((call) => call.path === '/api/admin/approvals/a');
    expect(attempts.map((call) => call.access)).toEqual(['Bearer old-admin', 'Bearer current-client']);
    expect(attempts.map((call) => call.body)).toEqual(['{"decision":"approve"}', '{"decision":"approve"}']);
    expect(attempts.map((call) => call.key)).toEqual(['same-decision', 'same-decision']);
    expect(JSON.parse(disk).tokens).toEqual(refreshed);
  });

  it('returns a downgraded restored admin session to sign-in after obtaining the current role', async () => {
    let disk = JSON.stringify({ version: 1, tokens: original });
    const transport = vi.fn<typeof fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/refresh') return response(refreshed);
      if (path === '/auth/logout') return new Response(null, { status: 204 });
      return new Headers(options?.headers).get('authorization') === 'Bearer old-admin'
        ? roleChanged() : response({ role: 'CLIENT' });
    });
    const session = createAdminSession({
      baseUrl: 'https://example.test', fetch: transport,
      read: () => disk, write: (value) => { disk = value; }, discardLegacy: () => {},
    });
    await session.restore();
    expect(session.getSnapshot().status).toBe('guest');
    expect(JSON.parse(disk).tokens).toBeNull();
    const logouts = transport.mock.calls.filter(([url]) => String(url).endsWith('/auth/logout'));
    expect(logouts).toHaveLength(1);
    expect(logouts[0]?.[1]?.body).toBe(JSON.stringify({ refreshToken: refreshed.refreshToken }));
  });
});
