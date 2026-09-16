import { api, naira } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn } from '../components/ui';
import { useState } from 'react';
import { createApprovalActions } from '../lib/approval-actions';

interface Approval {
  id: string;
  kind: string;
  amountKobo: number;
  maker: { phone: string };
}

export function Approvals() {
  const { data, loading, error, reloadFresh } = useAsync<Approval[]>(() =>
    api('/api/admin/approvals?status=PENDING'),
  );
  const [actions] = useState(() => createApprovalActions(
    (id, decision) => api(`/api/admin/approvals/${id}`, { method: 'POST', body: { decision } }), reloadFresh,
  ));
  const [actionError, setActionError] = useState<string | null>(null);
  const [, redraw] = useState(0);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setActionError(null);
    const result = actions.submit(id, decision);
    redraw((version) => version + 1);
    try {
      await result;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Couldn’t confirm this decision. Reload the latest records.');
    } finally { redraw((version) => version + 1); }
  }

  return (
    <Page title="Approvals (maker-checker)" actions={<Btn disabled={loading} onClick={() => {
      const result = actions.reload();
      redraw((version) => version + 1);
      void result.then((fresh) => { if (fresh) setActionError(null); }).finally(() => { redraw((version) => version + 1); });
    }}>Reload records</Btn>}>
      <p className="mb-4 -mt-3 text-sm text-slate-500">
        Money moves above the threshold need a second admin. You can&apos;t approve a request you made.
      </p>
      <State loading={loading} error={error} />
      {actionError ? <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p> : null}
      <Table head={['Kind', 'Amount', 'Requested by', 'Actions']}>
        {(data ?? []).map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2">{a.kind}</td>
            <td className="px-4 py-2">{naira(a.amountKobo)}</td>
            <td className="px-4 py-2">{a.maker.phone}</td>
            <td className="space-x-2 px-4 py-2">
              <Btn disabled={loading || actions.disabled(a.id)} onClick={() => void decide(a.id, 'approve')}>Approve</Btn>
              <Btn disabled={loading || actions.disabled(a.id)} variant="danger" onClick={() => void decide(a.id, 'reject')}>
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
