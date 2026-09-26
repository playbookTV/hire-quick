import { ReviewPanel } from '../components/ui';
import { useRef, useState } from 'react';
import { api, naira } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, Badge, EmptyRow } from '../components/ui';
import { BookingReview } from '../components/BookingReview';
interface Dispute {
  id: string;
  reason: string;
  status: string;
  booking: { id: string; event: { title: string }; payment: { grossAmount: number } | null };
}
export function Disputes() {
  const q = useAsync<Dispute[]>(() => api('/api/admin/disputes'));
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState('');
  const [outcome, setOutcome] = useState<'RELEASE' | 'REFUND'>('RELEASE');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  async function resolve(d: Dispute) {
    if (lock.current || resolution.trim().length < 3 || uncertain) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const r = await api<{ executed: boolean; approvalId?: string }>(
        `/api/admin/disputes/${d.id}/resolve`,
        { method: 'POST', body: { outcome, resolution: resolution.trim() } },
      );
      setNotice(
        r.executed
          ? 'Dispute resolved.'
          : r.approvalId
            ? 'Sent for a second admin to review in Approvals.'
            : 'Decision received. Payment processing is still pending.',
      );
      setSelected(null);
      await q.reloadFresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Couldn’t confirm this decision.');
      setUncertain(true);
      await q.reloadFresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Page
      title="Disputes"
      actions={
        <Btn
          variant="ghost"
          disabled={busy || q.loading}
          onClick={() => {
            void q.reloadFresh().then((fresh) => {
              if (fresh) {
                setUncertain(false);
                setSelected(null);
              }
            });
          }}
        >
          Reload records
        </Btn>
      }
    >
      <p className="muted mb-5">
        Review the booking, attendance, and each party’s account before moving funds.
      </p>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {notice && (
        <p className="notice" role="status">
          {notice}
          {uncertain && ' Reload records before making another decision.'}
        </p>
      )}
      {selected && (
        <ReviewPanel aria-label="Dispute review">
          <div className="page-heading">
            <h2>Review dispute</h2>
            <Btn variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
              Close review
            </Btn>
          </div>
          <BookingReview key={selected.id} id={selected.booking.id}>
            {(booking) => (
              <>
                <label htmlFor="outcome">Proposed outcome</label>
                <select
                  id="outcome"
                  value={outcome}
                  disabled={busy}
                  onChange={(e) => setOutcome(e.target.value as 'RELEASE' | 'REFUND')}
                >
                  <option value="RELEASE">Award to usher (72-hour hold applies)</option>
                  <option value="REFUND">Refund client</option>
                </select>
                <p>
                  {outcome === 'RELEASE'
                    ? `The usher receives ${naira(booking.payment?.usherPayout ?? 0)} after the platform fee.`
                    : `The client receives a refund of ${naira(booking.payment?.grossAmount ?? 0)}.`}{' '}
                  A second admin must approve amounts above the configured threshold.
                </p>
                <label htmlFor="resolution">Resolution and supporting reasoning</label>
                <textarea
                  id="resolution"
                  minLength={3}
                  maxLength={1000}
                  value={resolution}
                  disabled={busy}
                  onChange={(e) => setResolution(e.target.value)}
                />
                <Btn
                  disabled={
                    busy ||
                    q.loading ||
                    !!q.error ||
                    uncertain ||
                    resolution.trim().length < 3 ||
                    !booking.payment ||
                    booking.payment.escrowStatus !== 'FROZEN' ||
                    selected.status !== 'OPEN'
                  }
                  variant={outcome === 'REFUND' ? 'danger' : 'default'}
                  onClick={() => void resolve(selected)}
                >
                  {busy
                    ? 'Submitting decision…'
                    : outcome === 'REFUND'
                      ? 'Confirm refund decision'
                      : 'Confirm payout decision'}
                </Btn>
                {selected.status === 'UNDER_REVIEW' && (
                  <p className="muted">
                    This dispute already has a proposed decision. Continue in Approvals.
                  </p>
                )}
              </>
            )}
          </BookingReview>
        </ReviewPanel>
      )}
      <Table head={['Event', 'Reason', 'Amount', 'Status', 'Action']}>
        {q.data?.map((d) => (
          <tr key={d.id}>
            <td>{d.booking.event.title}</td>
            <td>{d.reason}</td>
            <td>{d.booking.payment ? naira(d.booking.payment.grossAmount) : '—'}</td>
            <td>
              <Badge>{d.status}</Badge>
            </td>
            <td>
              <Btn
                variant="ghost"
                disabled={busy || q.loading || !!q.error}
                onClick={() => {
                  setSelected(d);
                  setResolution('');
                  setOutcome('RELEASE');
                }}
              >
                Review case
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.length === 0 && <EmptyRow columns={5}>No open disputes.</EmptyRow>}
      </Table>
    </Page>
  );
}
