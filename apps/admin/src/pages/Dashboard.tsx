import { Link } from 'react-router-dom';
import { formatNaira, kobo } from '@hq/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State } from '../components/ui';

interface Stats {
  pendingVerifications: number;
  openDisputes: number;
  pendingApprovals: number;
  users: number;
  escrowHeldKobo: number;
  approvalThresholdKobo: number;
  owedToUshersKobo: number;
  platformRevenueKobo: number;
  payoutRunsAwaitingApproval: number;
}

export function Dashboard() {
  const { data, loading, error, reload } = useAsync<Stats>(() => api('/api/admin/stats'));
  const cards: Array<[string, string, string | null]> = data
    ? [
        ['Pending verifications', String(data.pendingVerifications), '/verifications'],
        ['Open disputes', String(data.openDisputes), '/disputes'],
        ['Pending approvals', String(data.pendingApprovals), '/approvals'],
        ['Users', String(data.users), '/users'],
        ['Payout runs awaiting approval', String(data.payoutRunsAwaitingApproval), '/payouts'],
        ['Escrow held', formatNaira(kobo(data.escrowHeldKobo)), '/ledger'],
        ['Owed to ushers (wallets)', formatNaira(kobo(data.owedToUshersKobo)), '/payouts'],
        ['HireQuick revenue not yet swept', formatNaira(kobo(data.platformRevenueKobo)), '/ledger'],
        ['Approval threshold', formatNaira(kobo(data.approvalThresholdKobo)), null],
      ]
    : [];

  return (
    <Page title="Dashboard" actions={<Link className="btn btn-ghost" to="/observability">View service health →</Link>}>
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
