import { ReviewPanel } from '../components/ui';
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useRecords } from '../lib/useRecords';
import { Page, State, Table, Btn, Badge, Pagination, EmptyRow } from '../components/ui';
interface U {
  id: string;
  role: string;
  phone: string;
  email: string | null;
  status: string;
}
export function Users() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [filters, setFilters] = useState('');
  return (
    <Page title="Users">
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(
            new URLSearchParams({
              ...(search.trim() ? { query: search.trim() } : {}),
              ...(role ? { role } : {}),
            }).toString(),
          );
        }}
      >
        <label>
          Phone or email
          <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option>CLIENT</option>
            <option>USHER</option>
            <option>ADMIN</option>
          </select>
        </label>
        <Btn type="submit">Search users</Btn>
      </form>
      <UserRecords key={filters} filters={filters} />
    </Page>
  );
}
function UserRecords({ filters }: { filters: string }) {
  const q = useRecords<U>('/api/admin/users', filters);
  const [selected, setSelected] = useState<U | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [notice, setNotice] = useState('');
  async function toggle(u: U) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice('');
    try {
      await api(`/api/admin/users/${u.id}/${u.status === 'SUSPENDED' ? 'reinstate' : 'suspend'}`, {
        method: 'POST',
      });
      setSelected(null);
      await q.reloadFresh();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'Couldn’t confirm the change. Reload before trying again.',
      );
      await q.reloadFresh();
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {notice && (
        <p role="alert" className="notice notice-error">
          {notice}
        </p>
      )}
      {selected && (
        <ReviewPanel aria-label="Review account change">
          <h2>
            {selected.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'} {selected.phone}?
          </h2>
          <p>
            {selected.status === 'SUSPENDED'
              ? 'This user will regain access to HireQuick.'
              : 'This user will lose access to HireQuick until an admin reinstates them.'}
          </p>
          <div className="action-row">
            <Btn
              variant={selected.status === 'SUSPENDED' ? 'default' : 'danger'}
              disabled={busy || q.loading || !!q.error}
              onClick={() => void toggle(selected)}
            >
              {busy ? 'Saving…' : 'Confirm change'}
            </Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
              Keep current status
            </Btn>
          </div>
        </ReviewPanel>
      )}
      <Table head={['Phone', 'Email', 'Role', 'Status', 'Actions']}>
        {q.data?.items.map((u) => (
          <tr key={u.id}>
            <td>{u.phone}</td>
            <td>{u.email ?? '—'}</td>
            <td>
              <Badge>{u.role}</Badge>
            </td>
            <td>
              <Badge>{u.status}</Badge>
            </td>
            <td>
              {u.role !== 'ADMIN' && (
                <Btn
                  disabled={busy || q.loading || !!q.error}
                  variant="ghost"
                  onClick={() => setSelected(u)}
                >
                  {u.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
                </Btn>
              )}
            </td>
          </tr>
        ))}
        {q.data?.items.length === 0 && (
          <EmptyRow columns={5}>No users match these filters.</EmptyRow>
        )}
      </Table>
      <Pagination
        hasNext={!!q.data?.nextCursor && !q.error}
        hasPrevious={q.hasPrevious}
        loading={q.loading || busy}
        onNext={q.next}
        onPrevious={q.previous}
      />
    </>
  );
}
