import { api, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn } from '../components/ui';

interface Verif {
  id: string;
  createdAt: string;
  idDocumentUrl: string;
  selfieUrl: string;
  usher: { user: { phone: string; email: string | null } };
}

export function Verifications() {
  const { data, loading, error, reload } = useAsync<Verif[]>(() =>
    api('/api/admin/verifications?status=PENDING'),
  );

  async function act(id: string, action: 'approve' | 'reject') {
    try {
      if (action === 'reject') {
        const reason = prompt('Reason for rejection?') ?? '';
        if (reason.length < 3) return;
        await api(`/api/admin/verifications/${id}/reject`, { method: 'POST', body: { reason } });
      } else {
        await api(`/api/admin/verifications/${id}/approve`, { method: 'POST' });
      }
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'error');
    }
  }

  return (
    <Page title="Verifications">
      <State loading={loading} error={error} />
      <Table head={['Usher', 'ID doc', 'Selfie', 'Submitted', 'Actions']}>
        {(data ?? []).map((v) => (
          <tr key={v.id}>
            <td className="px-4 py-2">{v.usher.user.phone}</td>
            <td className="px-4 py-2">
              <a className="text-blue-600 underline" href={v.idDocumentUrl} target="_blank" rel="noreferrer">
                view
              </a>
            </td>
            <td className="px-4 py-2">
              <a className="text-blue-600 underline" href={v.selfieUrl} target="_blank" rel="noreferrer">
                view
              </a>
            </td>
            <td className="px-4 py-2">{shortDate(v.createdAt)}</td>
            <td className="space-x-2 px-4 py-2">
              <Btn onClick={() => void act(v.id, 'approve')}>Approve</Btn>
              <Btn variant="danger" onClick={() => void act(v.id, 'reject')}>
                Reject
              </Btn>
            </td>
          </tr>
        ))}
        {data && data.length === 0 && (
          <tr>
            <td className="px-4 py-3 text-slate-400" colSpan={5}>
              No pending verifications.
            </td>
          </tr>
        )}
      </Table>
    </Page>
  );
}
