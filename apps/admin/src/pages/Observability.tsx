import { useEffect, useState } from 'react';
import type { MonitorCheck, MonitoringSnapshot, MonitorStatus } from '@hq/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Btn, Page, State } from '../components/ui';

const labels: Record<MonitorStatus, string> = {
  up: 'Healthy',
  down: 'Needs attention',
  paused: 'Paused',
  pending: 'Waiting for first signal',
  maintenance: 'Maintenance',
  unknown: 'Unknown',
  unavailable: 'Status unavailable',
  not_configured: 'Not connected',
};
function time(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'No signal reported';
}
function interval(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `${seconds} seconds`;
}
function Status({ status }: { status: MonitorStatus }) {
  return (
    <span className={`monitor-status monitor-status-${status}`}>
      <span aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
function MonitorCard({ check, external = false }: { check: MonitorCheck; external?: boolean }) {
  return (
    <article className="monitor-card">
      <div className="monitor-card-heading">
        <h3>{check.name}</h3>
        <Status status={check.status} />
      </div>
      <p className="muted">{check.detail}</p>
      {external && (
        <dl className="monitor-metadata">
          <div>
            <dt>Expected interval</dt>
            <dd>
              {check.intervalSeconds === null ? 'Not available' : interval(check.intervalSeconds)}
            </dd>
          </div>
          {check.graceSeconds !== null && (
            <div>
              <dt>Grace period</dt>
              <dd>{interval(check.graceSeconds)}</dd>
            </div>
          )}
          <div>
            <dt>Last signal</dt>
            <dd>{time(check.lastSignalAt)}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="monitor-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Observability() {
  const { data, loading, error, reload, reloadFresh } = useAsync<MonitoringSnapshot>(() =>
    api('/api/admin/observability', { signal: AbortSignal.timeout(12_000) }),
  );
  const [automatic, setAutomatic] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (automatic && !document.hidden) void reloadFresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [automatic, reloadFresh]);
  const stale = Boolean(data && (error || now - Date.parse(data.observedAt) > 90_000));
  const checks = data ? [...data.services, ...data.betterStack.checks] : [];
  const failing = checks.filter((check) => check.status === 'down').length;
  const incomplete = checks.filter((check) => !['up', 'down'].includes(check.status)).length;
  const title = stale
    ? 'Showing an older snapshot'
    : failing
      ? 'Some services need attention'
      : incomplete || data?.sentry.status !== 'connected'
        ? 'Monitoring setup is incomplete'
        : 'Monitored services are healthy';

  return (
    <Page
      title="Observability"
      actions={
        <div className="action-row">
          <label className="monitor-auto">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => setAutomatic(e.target.checked)}
            />
            Refresh every 30 seconds
          </label>
          <Btn variant="ghost" onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh now'}
          </Btn>
        </div>
      }
    >
      <p className="monitor-intro muted">
        Service health, scheduled checks and application errors in one place.
      </p>
      <State loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <section
            className={`monitor-summary ${stale || failing ? 'monitor-summary-attention' : ''}`}
            aria-label="Monitoring summary"
          >
            <div>
              <span className="monitor-eyebrow">CURRENT SNAPSHOT · {data.environment}</span>
              <h2>{title}</h2>
              <p>
                {checks.filter((check) => check.status === 'up').length} of {checks.length} checks
                healthy
                {failing > 0 ? ` · ${failing} need attention` : ''}
                {incomplete > 0 ? ` · ${incomplete} paused, pending or unavailable` : ''}
              </p>
            </div>
            <div className="monitor-updated">
              <span>Last refreshed</span>
              <strong>{time(data.observedAt)}</strong>
              {data.release && <small>Release {data.release.slice(0, 12)}</small>}
            </div>
          </section>
          {stale && (
            <p className="notice notice-error" role="status">
              These results may be out of date. Refresh successfully before relying on the displayed
              health.
            </p>
          )}

          <section className="monitor-section" aria-labelledby="services-title">
            <header className="monitor-section-heading">
              <div>
                <h2 id="services-title">Service health</h2>
                <p className="muted">Connection checks from the API serving this console.</p>
              </div>
              <ExternalLink href={data.logsUrl}>Open Railway logs</ExternalLink>
            </header>
            <div className="monitor-services">
              {data.services.map((check) => (
                <MonitorCard key={check.key} check={check} />
              ))}
            </div>
          </section>

          <section className="monitor-section" aria-labelledby="jobs-title">
            <header className="monitor-section-heading">
              <div>
                <h2 id="jobs-title">Uptime & scheduled jobs</h2>
                <p className="muted">
                  Better Stack reports external availability and whether scheduled work is checking
                  in.
                </p>
              </div>
              <ExternalLink href={data.betterStack.dashboardUrl}>Open Better Stack</ExternalLink>
            </header>
            <div className="monitor-checks">
              {data.betterStack.checks.map((check) => (
                <MonitorCard key={check.key} check={check} external />
              ))}
            </div>
            <p className="monitor-footnote muted">
              A paused or pending monitor does not confirm service health. A healthy check does not
              verify email delivery; manage and test alert recipients in Better Stack.
            </p>
          </section>

          <section className="monitor-section" aria-labelledby="errors-title">
            <header className="monitor-section-heading">
              <div>
                <h2 id="errors-title">Application errors</h2>
                <p className="muted">Sentry · {data.sentry.projects.join(', ')}</p>
              </div>
              <ExternalLink href={data.sentry.dashboardUrl}>Open Sentry</ExternalLink>
            </header>
            <div className="monitor-errors">
              {data.sentry.status !== 'connected' ? (
                <div className="monitor-empty">
                  <Status status={data.sentry.status} />
                  <h3>
                    {data.sentry.status === 'not_configured'
                      ? 'Connect Sentry issue access'
                      : 'Sentry status is unavailable'}
                  </h3>
                  <p className="muted">{data.sentry.detail}</p>
                </div>
              ) : (
                <>
                  <p className="monitor-footnote muted">{data.sentry.detail}</p>
                  {data.sentry.issues.length === 0 ? (
                    <div className="monitor-empty">
                      <h3>No unresolved issues returned</h3>
                      <p className="muted">
                        This does not verify crash reporting on installed app builds. Check the
                        release in Sentry after a device test.
                      </p>
                    </div>
                  ) : (
                    <ul className="monitor-issues">
                      {data.sentry.issues.map((issue) => (
                        <li key={issue.id}>
                          <div>
                            <ExternalLink href={issue.url}>{issue.reference}</ExternalLink>
                            <p className="muted">
                              {issue.project} · {issue.level}
                            </p>
                          </div>
                          <div className="monitor-issue-count">
                            <strong>{issue.events.toLocaleString()} events</strong>
                            <span className="muted">Last seen {time(issue.lastSeen)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <p className="monitor-footnote muted">
              Open an issue in Sentry for its full diagnostics. Event messages, personal data and
              credentials are not copied into this view.
            </p>
          </section>
        </>
      )}
    </Page>
  );
}
