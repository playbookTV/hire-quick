import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, Badge } from '../components/ui';

interface U {
  id: string;
  role: string;
  phone: string;
  email: string | null;
  status: string;
}

export function Users() {
  const { data, loading, error, reload } = useAsync<U[]>(() => api('/api/admin/users'));

  async function toggle(u: U) {
    const action = u.status === 'SUSPENDED' ? 'reinstate' : 'suspend';
    try {
      await api(`/api/admin/users/${u.id}/${action}`, { method: 'POST' });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'error');
    }
  }

  return (
    <Page title="Users">
      <State loading={loading} error={error} />
      <Table head={['Phone', 'Email', 'Role', 'Status', 'Actions']}>
        {(data ?? []).map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-2">{u.phone}</td>
            <td className="px-4 py-2">{u.email ?? '—'}</td>
            <td className="px-4 py-2">
              <Badge>{u.role}</Badge>
            </td>
            <td className="px-4 py-2">
              <Badge>{u.status}</Badge>
            </td>
            <td className="px-4 py-2">
              {u.role !== 'ADMIN' && (
                <Btn variant={u.status === 'SUSPENDED' ? 'default' : 'danger'} onClick={() => void toggle(u)}>
                  {u.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
                </Btn>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </Page>
  );
}
