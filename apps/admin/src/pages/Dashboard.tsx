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
  const { data, loading, error } = useAsync<Stats>(() => api('/api/admin/stats'));
  const cards: Array<[string, string]> = data
    ? [
        ['Pending verifications', String(data.pendingVerifications)],
        ['Open disputes', String(data.openDisputes)],
        ['Pending approvals', String(data.pendingApprovals)],
        ['Users', String(data.users)],
        ['Escrow held', naira(data.escrowHeldKobo)],
        ['Approval threshold', naira(data.approvalThresholdKobo)],
      ]
    : [];

  return (
    <Page title="Dashboard">
      <State loading={loading} error={error} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </Page>
  );
}
