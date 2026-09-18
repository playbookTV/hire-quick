import { Link } from 'react-router-dom';
import { api, naira } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State } from '../components/ui';

interface Stats {
  pendingVerifications: number;
  openDisputes: number;
  pendingApprovals: number;
  users: number;
  escrowHeldKobo: number;
  approvalThresholdKobo: number;
}

export function Dashboard() {
  const { data, loading, error, reload } = useAsync<Stats>(() => api('/api/admin/stats'));
  const cards: Array<[string, string, string | null]> = data
    ? [
        ['Pending verifications', String(data.pendingVerifications), '/verifications'],
        ['Open disputes', String(data.openDisputes), '/disputes'],
        ['Pending approvals', String(data.pendingApprovals), '/approvals'],
        ['Users', String(data.users), '/users'],
        ['Escrow held', naira(data.escrowHeldKobo), '/ledger'],
        ['Approval threshold', naira(data.approvalThresholdKobo), null],
      ]
    : [];

  return (
    <Page title="Dashboard">
      <State loading={loading} error={error} onRetry={reload} />
      <div className="stat-grid">
        {cards.map(([label, value, to]) =>
          to ? (
            <Link key={label} to={to} className="stat-card">
              <span className="muted">{label}</span>
              <strong>{value}</strong>
              <small>View records →</small>
            </Link>
          ) : (
            <div key={label} className="stat-card">
              <span className="muted">{label}</span>
              <strong>{value}</strong>
              <small>Requires a second administrator above this amount</small>
            </div>
          ),
        )}
      </div>
    </Page>
  );
}
