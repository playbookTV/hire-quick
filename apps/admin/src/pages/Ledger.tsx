import { api, naira, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Badge } from '../components/ui';

interface Entry {
  id: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  booking: { event: { title: string } } | null;
}

export function Ledger() {
  const { data, loading, error } = useAsync<Entry[]>(() => api('/api/admin/ledger?limit=100'));
  return (
    <Page title="Escrow ledger">
      <State loading={loading} error={error} />
      <Table head={['When', 'Type', 'Amount', 'Balance after', 'Booking']}>
        {(data ?? []).map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-2">{shortDate(e.createdAt)}</td>
            <td className="px-4 py-2">
              <Badge>{e.entryType}</Badge>
            </td>
            <td className={`px-4 py-2 ${e.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {naira(e.amount)}
            </td>
            <td className="px-4 py-2">{naira(e.balanceAfter)}</td>
            <td className="px-4 py-2">{e.booking?.event.title ?? '—'}</td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}
