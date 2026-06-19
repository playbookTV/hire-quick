import { api, naira } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, Badge } from '../components/ui';

interface Dispute {
  id: string;
  reason: string;
  status: string;
  booking: { id: string; event: { title: string }; payment: { grossAmount: number } | null };
}

export function Disputes() {
  const { data, loading, error, reload } = useAsync<Dispute[]>(() => api('/api/admin/disputes'));

  async function resolve(id: string, outcome: 'RELEASE' | 'REFUND') {
    const resolution = prompt(`Resolution note (${outcome})?`) ?? '';
    if (resolution.length < 3) return;
    try {
      const r = await api<{ executed: boolean }>(`/api/admin/disputes/${id}/resolve`, {
        method: 'POST',
        body: { outcome, resolution },
      });
      alert(r.executed ? 'Resolved.' : 'Above threshold — sent for a second admin to approve.');
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'error');
    }
  }

  return (
    <Page title="Disputes">
      <State loading={loading} error={error} />
      <Table head={['Event', 'Reason', 'Amount', 'Status', 'Actions']}>
        {(data ?? []).map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2">{d.booking.event.title}</td>
            <td className="px-4 py-2">{d.reason}</td>
            <td className="px-4 py-2">{d.booking.payment ? naira(d.booking.payment.grossAmount) : '—'}</td>
            <td className="px-4 py-2">
              <Badge>{d.status}</Badge>
            </td>
            <td className="space-x-2 px-4 py-2">
              <Btn onClick={() => void resolve(d.id, 'RELEASE')}>Pay usher</Btn>
              <Btn variant="danger" onClick={() => void resolve(d.id, 'REFUND')}>
                Refund client
              </Btn>
            </td>
          </tr>
        ))}
        {data && data.length === 0 && (
          <tr>
            <td className="px-4 py-3 text-slate-400" colSpan={5}>
              No open disputes.
            </td>
          </tr>
        )}
      </Table>
    </Page>
  );
}
