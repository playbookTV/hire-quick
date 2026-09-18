import { ReviewPanel } from '../components/ui';
import { useRef, useState } from 'react';
import { api, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, EmptyRow } from '../components/ui';
interface Verif {
  id: string;
  createdAt: string;
  idDocumentUrl: string | null;
  selfieUrl: string | null;
  usher: { user: { phone: string; email: string | null } };
}
function Evidence({ url, label }: { url: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <h3>{label}</h3>
      {url ? (
        <>
          {!failed ? (
            <img src={url} alt={label} onError={() => setFailed(true)} />
          ) : (
            <p className="notice">Preview unavailable. Open the document to inspect it.</p>
          )}
          <a href={url} target="_blank" rel="noreferrer">
            Open {label.toLowerCase()} in a new tab
          </a>
        </>
      ) : (
        <p className="notice">No {label.toLowerCase()} supplied.</p>
      )}
    </div>
  );
}
export function Verifications() {
  const q = useAsync<Verif[]>(() => api('/api/admin/verifications?status=PENDING'));
  const [selected, setSelected] = useState<Verif | null>(null);
  const [reason, setReason] = useState('');
  const [inspected, setInspected] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  async function act(v: Verif, action: 'approve' | 'reject') {
    if (lock.current || uncertain) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/verifications/${v.id}/${action}`, {
        method: 'POST',
        ...(action === 'reject' ? { body: { reason: reason.trim() } } : {}),
      });
      setSelected(null);
      await q.reloadFresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t confirm the decision.');
      setUncertain(true);
      await q.reloadFresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Page
      title="Identity verifications"
      actions={
        <Btn
          variant="ghost"
          disabled={busy || q.loading}
          onClick={() => {
            void q.reloadFresh().then((fresh) => {
              if (fresh) {
                setUncertain(false);
                setSelected(null);
                setError('');
              }
            });
          }}
        >
          Reload records
        </Btn>
      }
    >
      <p className="muted mb-5">Compare the ID and selfie, then record your decision.</p>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {error && (
        <p className="notice notice-error" role="alert">
          {error} Reload records before another decision.
        </p>
      )}
      {selected && (
        <ReviewPanel aria-label="Identity review">
          <div className="page-heading">
            <h2>{selected.usher.user.phone}</h2>
            <Btn variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
              Close review
            </Btn>
          </div>
          <p className="muted">
            Submitted {shortDate(selected.createdAt)} ·{' '}
            {selected.usher.user.email ?? 'No email supplied'}
          </p>
          <div className="evidence-grid">
            <Evidence key={`${selected.id}-id`} url={selected.idDocumentUrl} label="ID document" />
            <Evidence key={`${selected.id}-selfie`} url={selected.selfieUrl} label="Selfie" />
          </div>
          <label className="action-row">
            <input
              type="checkbox"
              checked={inspected}
              disabled={busy}
              onChange={(e) => setInspected(e.target.checked)}
            />{' '}
            I have inspected both documents and verified that they match.
          </label>
          <label htmlFor="reason">Reason if rejecting</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            maxLength={500}
            placeholder="Explain what needs correcting so the usher can resubmit."
          />
          <div className="action-row">
            <Btn
              disabled={
                busy ||
                q.loading ||
                !!q.error ||
                uncertain ||
                !selected.idDocumentUrl ||
                !selected.selfieUrl ||
                !inspected
              }
              onClick={() => void act(selected, 'approve')}
            >
              {busy ? 'Saving decision…' : 'Approve identity'}
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || q.loading || !!q.error || uncertain || reason.trim().length < 3}
              onClick={() => void act(selected, 'reject')}
            >
              Reject with reason
            </Btn>
          </div>
        </ReviewPanel>
      )}
      <Table head={['Usher', 'Evidence', 'Submitted', 'Action']}>
        {q.data?.map((v) => (
          <tr key={v.id}>
            <td>{v.usher.user.phone}</td>
            <td>
              {v.idDocumentUrl && v.selfieUrl ? 'ID and selfie available' : 'Documents incomplete'}
            </td>
            <td>{shortDate(v.createdAt)}</td>
            <td>
              <Btn
                variant="ghost"
                disabled={busy || q.loading || !!q.error}
                onClick={() => {
                  setSelected(v);
                  setReason('');
                  setInspected(false);
                }}
              >
                Review identity
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.length === 0 && (
          <EmptyRow columns={4}>No pending identity verifications.</EmptyRow>
        )}
      </Table>
    </Page>
  );
}
