import { api, naira } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn } from '../components/ui';

interface Approval {
  id: string;
  kind: string;
  amountKobo: number;
  maker: { phone: string };
}

export function Approvals() {
  const { data, loading, error, reload } = useAsync<Approval[]>(() =>
    api('/api/admin/approvals?status=PENDING'),
  );

  async function decide(id: string, decision: 'approve' | 'reject') {
    try {
      await api(`/api/admin/approvals/${id}`, { method: 'POST', body: { decision } });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'error');
    }
  }

  return (
    <Page title="Approvals (maker-checker)">
      <p className="mb-4 -mt-3 text-sm text-slate-500">
        Money moves above the threshold need a second admin. You can&apos;t approve a request you made.
      </p>
      <State loading={loading} error={error} />
      <Table head={['Kind', 'Amount', 'Requested by', 'Actions']}>
        {(data ?? []).map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2">{a.kind}</td>
            <td className="px-4 py-2">{naira(a.amountKobo)}</td>
            <td className="px-4 py-2">{a.maker.phone}</td>
            <td className="space-x-2 px-4 py-2">
              <Btn onClick={() => void decide(a.id, 'approve')}>Approve</Btn>
              <Btn variant="danger" onClick={() => void decide(a.id, 'reject')}>
                Reject
              </Btn>
            </td>
          </tr>
        ))}
        {data && data.length === 0 && (
          <tr>
            <td className="px-4 py-3 text-slate-400" colSpan={4}>
              Nothing awaiting a second admin.
            </td>
          </tr>
        )}
      </Table>
    </Page>
  );
}
