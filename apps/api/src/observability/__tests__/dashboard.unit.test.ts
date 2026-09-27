import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMonitoringDashboard, type DashboardConfig } from '../dashboard.js';

const config: DashboardConfig = {
  environment: 'test',
  release: 'release-123',
  betterStackToken: 'private-better-stack-token',
  monitorIds: { api: '1', checkouts: '2', reconciliation: '3', audit: '4' },
  sentryToken: 'private-sentry-token',
  sentryOrganization: 'studio-templar',
  sentryProjects: ['react-native'],
  sentryOrigin: 'https://de.sentry.io',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const resource = (id: string, status = 'up') => ({
  data: {
    id,
    attributes: {
      status,
      period: 300,
      grace: 600,
      check_frequency: 60,
      last_checked_at: '2026-09-25T12:00:00Z',
      url: 'https://uptime.betterstack.com/api/v1/heartbeat/private-secret',
      privateData: { email: 'private@example.com' },
    },
  },
});
const issue = {
  id: '100',
  shortId: 'REACT-NATIVE-1',
  project: { id: '9', slug: 'react-native' },
  count: '3',
  lastSeen: '2026-09-25T12:00:00Z',
  level: 'error',
  title: 'customer private@example.com',
  culprit: 'secret',
  user: { email: 'private@example.com' },
  permalink: 'https://evil.example/steal',
  request: { headers: { Authorization: 'secret' } },
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('admin monitoring snapshot', () => {
  it('projects only safe fields and only selected Sentry projects', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const url = new URL(String(input));
      if (url.hostname === 'de.sentry.io') {
        expect(url.searchParams.getAll('project')).toEqual(['react-native']);
        return response([issue, { ...issue, id: '200', project: { id: '8', slug: 'unrelated' } }]);
      }
      return response(resource(url.pathname.split('/').at(-1)!));
    });
    const read = createMonitoringDashboard(config, {
      database: async () => undefined,
      redis: async () => undefined,
      fetch: fetcher,
    });
    const result = await read();
    expect(result.sentry.status).toBe('connected');
    expect(result.sentry.issues).toHaveLength(1);
    expect(result.sentry.issues[0]?.url).toBe(
      'https://sentry.io/organizations/studio-templar/issues/100/',
    );
    const json = JSON.stringify(result);
    for (const secret of [
      'private-secret',
      'private@example.com',
      'private-better-stack-token',
      'private-sentry-token',
      'evil.example',
      'Authorization',
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(result.services.every((check) => check.status === 'up')).toBe(true);
    expect(result.betterStack.checks[1]?.lastSignalAt).toBeNull();
  });

  it('does not call providers without credentials or falsely report unconfigured checks as healthy', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const read = createMonitoringDashboard(
      { ...config, betterStackToken: '', sentryToken: '' },
      {
        database: async () => undefined,
        redis: async () => {
          throw new Error('redis://secret');
        },
        fetch: fetcher,
      },
    );
    const result = await read();
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.sentry.status).toBe('not_configured');
    expect(result.betterStack.checks.every((c) => c.status === 'not_configured')).toBe(true);
    expect(result.services.find((c) => c.key === 'redis')?.status).toBe('down');
    expect(JSON.stringify(result)).not.toContain('redis://secret');
  });

  it('keeps paused, pending and failed checks distinct and isolates provider failures', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'de.sentry.io') return response({ secret: 'not disclosed' }, 403);
      const id = url.pathname.split('/').at(-1)!;
      if (id === '4') return response({}, 429);
      return response(resource(id, { '1': 'paused', '2': 'pending', '3': 'down' }[id]));
    });
    const result = await createMonitoringDashboard(config, {
      database: async () => undefined,
      redis: async () => undefined,
      fetch: fetcher,
    })();
    expect(result.betterStack.checks.map((c) => c.status)).toEqual([
      'paused',
      'pending',
      'down',
      'unavailable',
    ]);
    expect(result.sentry.status).toBe('unavailable');
    expect(result.sentry.detail).toContain('Read access was rejected');
    expect(JSON.stringify(result)).not.toContain('not disclosed');
  });

  it('rejects wrong resources and malformed issue payloads without leaking them', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      new URL(String(input)).hostname === 'de.sentry.io'
        ? response([{ ...issue, count: 'broken private data' }])
        : response(resource('wrong-id')),
    );
    const result = await createMonitoringDashboard(config, {
      database: async () => undefined,
      redis: async () => undefined,
      fetch: fetcher,
    })();
    expect(result.betterStack.checks.every((c) => c.status === 'unavailable')).toBe(true);
    expect(result.sentry.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('private data');
  });

  it('shares concurrent refreshes and caches snapshots for thirty seconds', async () => {
    let now = Date.now();
    const database = vi.fn(async () => undefined);
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return response(
        url.hostname === 'de.sentry.io' ? [] : resource(url.pathname.split('/').at(-1)!),
      );
    });
    const read = createMonitoringDashboard(config, {
      database,
      redis: async () => undefined,
      fetch: fetcher,
      now: () => now,
    });
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(await read()).toBe(a);
    now += 30_001;
    expect((await read()).observedAt).not.toBe(a.observedAt);
    expect(database).toHaveBeenCalledTimes(2);
  });

  it('bounds dependency timeouts and does not stack probes against a stuck database', async () => {
    vi.useFakeTimers();
    const database = vi.fn(() => new Promise(() => undefined));
    const read = createMonitoringDashboard(
      { ...config, betterStackToken: '', sentryToken: '' },
      {
        database,
        redis: async () => undefined,
      },
    );
    const first = read();
    await vi.advanceTimersByTimeAsync(2001);
    expect((await first).services.find((c) => c.key === 'database')?.status).toBe('down');
    await vi.advanceTimersByTimeAsync(30_001);
    const second = read();
    await vi.advanceTimersByTimeAsync(2001);
    await second;
    expect(database).toHaveBeenCalledTimes(1);
  });

  it('treats network timeouts as unknown health while keeping local service checks', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new DOMException('private URL', 'TimeoutError');
    });
    const result = await createMonitoringDashboard(config, {
      database: async () => undefined,
      redis: async () => undefined,
      fetch: fetcher,
    })();
    expect(result.betterStack.checks.every((c) => c.status === 'unavailable')).toBe(true);
    expect(result.services.every((c) => c.status === 'up')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private URL');
  });
});
