import { z } from 'zod';
import type { MonitorCheck, MonitoringSnapshot, MonitorStatus } from '@hq/shared';

export interface DashboardConfig {
  environment: string;
  release: string;
  betterStackToken: string;
  monitorIds: { api: string; checkouts: string; reconciliation: string; audit: string };
  sentryToken: string;
  sentryOrganization: string;
  sentryProjects: string[];
  sentryOrigin: 'https://sentry.io' | 'https://de.sentry.io' | 'https://us.sentry.io';
}

const timestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};
const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const resourceSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      status: z.string(),
      paused_at: z.unknown().optional(),
      last_checked_at: z.unknown().optional(),
      last_ping_at: z.unknown().optional(),
      check_frequency: z.unknown().optional(),
      period: z.unknown().optional(),
      grace: z.unknown().optional(),
    }),
  }),
});
const issueSchema = z.array(
  z.object({
    id: z.string().regex(/^\d+$/),
    shortId: z.string().regex(/^[A-Z0-9_-]+$/i),
    project: z.object({ id: z.string(), slug: z.string().regex(/^[a-zA-Z0-9_-]+$/) }),
    level: z.enum(['fatal', 'error', 'warning', 'info', 'debug', 'log']),
    count: z
      .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
      .refine((value) => Number.isSafeInteger(Number(value))),
    lastSeen: z.unknown().optional(),
  }),
);

class ProviderError extends Error {
  constructor(readonly reason: 'credentials' | 'rate_limit' | 'missing' | 'unavailable') {
    super(reason);
  }
}

/** Fixed provider hosts, no redirects, bounded requests, and no raw response/error logging. */
async function readProvider(url: URL, token: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
    redirect: 'error',
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderError(
      response.status === 401 || response.status === 403
        ? 'credentials'
        : response.status === 429
          ? 'rate_limit'
          : response.status === 404
            ? 'missing'
            : 'unavailable',
    );
  }
  return response.json();
}

function providerFailure(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.reason === 'credentials')
      return 'Read access was rejected. Ask an administrator to check the provider connection.';
    if (error.reason === 'rate_limit')
      return 'The provider is limiting requests. Status will be checked again shortly.';
    if (error.reason === 'missing')
      return 'The configured resource could not be found. Check its provider settings.';
  }
  return 'The provider could not be reached or returned an unexpected response. Its health is unknown.';
}

const statusDetails: Record<MonitorStatus, string> = {
  up: 'The latest provider check passed.',
  down: 'The provider reports a failed or missed check. Investigate this service.',
  paused: 'Monitoring is paused. Activate it after deployment and alert routing are verified.',
  pending: 'Waiting for the first check or job heartbeat. Monitoring is not verified yet.',
  maintenance: 'Monitoring is in a maintenance window.',
  unknown: 'The provider has not supplied a recognized health status.',
  unavailable: 'Current status could not be read.',
  not_configured: 'This monitor has not been connected to the admin console.',
};

/** At most one underlying dependency probe is pending, even after a response times out. */
function boundedProbe(probe: () => Promise<unknown>) {
  let pending: Promise<boolean> | undefined;
  return async (): Promise<boolean> => {
    pending ??= Promise.resolve()
      .then(probe)
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        pending = undefined;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createMonitoringDashboard(
  config: DashboardConfig,
  deps: {
    database: () => Promise<unknown>;
    redis: () => Promise<unknown>;
    fetch?: typeof fetch;
    now?: () => number;
  },
) {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const iso = () => new Date(now()).toISOString();
  const database = boundedProbe(deps.database);
  const redis = boundedProbe(deps.redis);
  const sentryDashboard = new URL(
    `https://sentry.io/organizations/${encodeURIComponent(config.sentryOrganization)}/issues/`,
  );
  for (const project of config.sentryProjects)
    sentryDashboard.searchParams.append('project', project);
  sentryDashboard.searchParams.set('query', 'is:unresolved');
  const resources = [
    { key: 'api', name: 'API readiness', kind: 'monitors', id: config.monitorIds.api },
    {
      key: 'checkouts',
      name: 'Checkout recovery',
      kind: 'heartbeats',
      id: config.monitorIds.checkouts,
    },
    {
      key: 'reconciliation',
      name: 'Financial reconciliation',
      kind: 'heartbeats',
      id: config.monitorIds.reconciliation,
    },
    { key: 'audit', name: 'Audit verification', kind: 'heartbeats', id: config.monitorIds.audit },
  ];
  async function readCheck(resource: (typeof resources)[number]): Promise<MonitorCheck> {
    const base = {
      key: resource.key,
      name: resource.name,
      lastSignalAt: null,
      intervalSeconds: null,
      graceSeconds: null,
    };
    if (!config.betterStackToken || !resource.id)
      return {
        ...base,
        status: 'not_configured',
        checkedAt: null,
        detail: statusDetails.not_configured,
      };
    try {
      const result = resourceSchema.parse(
        await readProvider(
          new URL(
            `https://uptime.betterstack.com/api/v2/${resource.kind}/${encodeURIComponent(resource.id)}`,
          ),
          config.betterStackToken,
          fetcher,
        ),
      ).data;
      if (result.id !== resource.id) throw new Error('Unexpected resource');
      const a = result.attributes;
      const status: MonitorStatus = a.paused_at
        ? 'paused'
        : ['up', 'down', 'paused', 'pending', 'maintenance'].includes(a.status)
          ? (a.status as MonitorStatus)
          : 'unknown';
      return {
        ...base,
        status,
        detail: statusDetails[status],
        checkedAt: iso(),
        lastSignalAt: timestamp(resource.kind === 'monitors' ? a.last_checked_at : a.last_ping_at),
        intervalSeconds: seconds(resource.kind === 'monitors' ? a.check_frequency : a.period),
        graceSeconds: seconds(a.grace),
      };
    } catch (error) {
      return { ...base, status: 'unavailable', detail: providerFailure(error), checkedAt: iso() };
    }
  }
  async function readIssues(): Promise<MonitoringSnapshot['sentry']> {
    const base = {
      dashboardUrl: sentryDashboard.toString(),
      projects: config.sentryProjects,
      issues: [],
    };
    if (!config.sentryToken)
      return {
        ...base,
        status: 'not_configured',
        checkedAt: null,
        detail:
          'Sentry issue access is not connected. A server-side read token is required; build-upload authentication is separate.',
      };
    try {
      const url = new URL(
        `/api/0/organizations/${encodeURIComponent(config.sentryOrganization)}/issues/`,
        config.sentryOrigin,
      );
      for (const project of config.sentryProjects) url.searchParams.append('project', project);
      url.searchParams.set('query', 'is:unresolved');
      url.searchParams.set('statsPeriod', '14d');
      url.searchParams.set('limit', '10');
      url.searchParams.set('sort', 'date');
      const issues = issueSchema.parse(await readProvider(url, config.sentryToken, fetcher));
      // Defensive project filtering prevents other organization projects appearing here.
      const selected = issues.filter(
        (i) =>
          config.sentryProjects.includes(i.project.id) ||
          config.sentryProjects.includes(i.project.slug),
      );
      return {
        ...base,
        status: 'connected',
        checkedAt: iso(),
        detail:
          'Up to 10 recent unresolved issues seen in the last 14 days, across all environments. Event counts are lifetime totals.',
        issues: selected
          .slice(0, 10)
          .map((i) => ({
            id: i.id,
            reference: i.shortId,
            project: i.project.slug,
            level: i.level,
            events: Number(i.count),
            lastSeen: timestamp(i.lastSeen),
            url: `https://sentry.io/organizations/${encodeURIComponent(config.sentryOrganization)}/issues/${i.id}/`,
          })),
      };
    } catch (error) {
      return { ...base, status: 'unavailable', checkedAt: iso(), detail: providerFailure(error) };
    }
  }
  async function collect(): Promise<MonitoringSnapshot> {
    const [dbOk, redisOk, checks, sentry] = await Promise.all([
      database(),
      redis(),
      Promise.all(resources.map(readCheck)),
      readIssues(),
    ]);
    const observedAt = iso();
    const service = (key: string, name: string, ok: boolean, detail: string): MonitorCheck => ({
      key,
      name,
      status: ok ? 'up' : 'down',
      detail,
      checkedAt: observedAt,
      lastSignalAt: null,
      intervalSeconds: null,
      graceSeconds: null,
    });
    return {
      observedAt,
      refreshAfterSeconds: 30,
      environment: config.environment,
      release: config.release || null,
      services: [
        service(
          'api',
          'Admin API',
          true,
          'This API instance is responding. External availability is shown below.',
        ),
        service(
          'database',
          'Database',
          dbOk,
          dbOk
            ? 'The database connection check passed.'
            : 'The database check failed or timed out.',
        ),
        service(
          'redis',
          'Redis',
          redisOk,
          redisOk ? 'The Redis connection check passed.' : 'The Redis check failed or timed out.',
        ),
      ],
      betterStack: { checks, dashboardUrl: 'https://uptime.betterstack.com/' },
      sentry,
      logsUrl: 'https://railway.com/project/396c28f8-30ac-4fd8-ba96-684e9a27d0e6',
    };
  }
  let cache: MonitoringSnapshot | undefined;
  let expires = 0;
  let flight: Promise<MonitoringSnapshot> | undefined;
  return (): Promise<MonitoringSnapshot> => {
    if (cache && now() < expires) return Promise.resolve(cache);
    flight ??= collect()
      .then((value) => {
        cache = value;
        expires = now() + 30_000;
        return value;
      })
      .finally(() => {
        flight = undefined;
      });
    return flight;
  };
}
