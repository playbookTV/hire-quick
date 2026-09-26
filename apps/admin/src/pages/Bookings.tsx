import type { CancellationSummary } from '@hq/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, naira } from '../lib/api';
import { useRecords } from '../lib/useRecords';
import { BookingReview, type ReviewBooking } from '../components/BookingReview';
import { Page, State, Table, Btn, Pagination, ReviewPanel } from '../components/ui';
type BookingRow = {
  id: string;
  status: string;
  amount: number;
  event: { title: string };
  usher: { displayName: string | null };
};
export function Bookings() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(params.get('booking') ?? '');
  const [revision, setRevision] = useState(0);
  return (
    <Page title="Bookings & refunds">
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(new URLSearchParams({ query: search.trim() }).toString());
        }}
      >
        <label>
          Booking reference, event or person
          <input value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Btn type="submit">Search bookings</Btn>
      </form>
      {selected ? (
        <ReviewPanel key={selected} aria-label="Booking case">
          <div className="page-heading">
            <h2>Booking case</h2>
            <Btn onClick={() => setRevision((n) => n + 1)}>Refresh case</Btn>
            <Btn variant="ghost" onClick={() => setSelected('')}>
              Close
            </Btn>
          </div>
          <BookingReview key={`${selected}-${revision}`} id={selected}>
            {(b) => <RefundAction key={b.id} booking={b} />}
          </BookingReview>
        </ReviewPanel>
      ) : null}
      <PendingCancellations onSelect={setSelected} />
      <BookingRecords key={filter} filter={filter} onSelect={setSelected} />
    </Page>
  );
}
function PendingCancellations({ onSelect }: { onSelect: (id: string) => void }) {
  const q = useRecords<{ id: string; bookingId: string; cancellation: CancellationSummary }>(
    '/api/admin/cancellations',
    '',
  );
  return (
    <>
      <h2>Cancellation requests</h2>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      <Table head={['Status', 'Client refund', 'Net usher payout', 'Action']}>
        {q.data?.items.map((row) => (
          <tr key={row.id}>
            <td>{row.cancellation.status.replaceAll('_', ' ')}</td>
            <td>{naira(row.cancellation.refundKobo)}</td>
            <td>{naira(row.cancellation.usherPayoutKobo)}</td>
            <td>
              <Btn onClick={() => onSelect(row.bookingId)}>Review cancellation</Btn>
            </td>
          </tr>
        ))}
        {q.data?.items.length === 0 && (
          <tr>
            <td colSpan={4}>No pending cancellation requests.</td>
          </tr>
        )}
      </Table>
      <Pagination
        hasNext={!!q.data?.nextCursor && !q.error}
        hasPrevious={q.hasPrevious}
        loading={q.loading}
        onNext={q.next}
        onPrevious={q.previous}
      />
    </>
  );
}

function BookingRecords({ filter, onSelect }: { filter: string; onSelect: (id: string) => void }) {
  const q = useRecords<BookingRow>('/api/admin/bookings', filter);
  return (
    <>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      <Table head={['Event', 'Usher', 'Status', 'Amount', 'Action']}>
        {q.data?.items.map((b) => (
          <tr key={b.id}>
            <td>{b.event.title}</td>
            <td>{b.usher.displayName ?? 'Usher'}</td>
            <td>{b.status}</td>
            <td>{naira(b.amount)}</td>
            <td>
              <Btn variant="ghost" onClick={() => onSelect(b.id)}>
                Review booking
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.items.length === 0 ? (
          <tr>
            <td colSpan={5}>No matching bookings.</td>
          </tr>
        ) : null}
      </Table>
      <Pagination
        hasNext={!!q.data?.nextCursor && !q.error}
        hasPrevious={q.hasPrevious}
        loading={q.loading}
        onNext={q.next}
        onPrevious={q.previous}
      />
    </>
  );
}
function RefundAction({ booking }: { booking: ReviewBooking }) {
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const cancellationEligible =
    booking.cancellation?.status === 'AWAITING_APPROVAL' &&
    !booking.refundApprovals?.some((a) => ['PENDING', 'APPROVED'].includes(a.status));
  const eligible =
    ['CONFIRMED', 'CANCELLED', 'NO_SHOW'].includes(booking.status) &&
    booking.payment?.escrowStatus === 'HELD' &&
    !booking.refund &&
    !booking.refundApprovals?.some((a) => ['PENDING', 'APPROVED'].includes(a.status));
  async function refund() {
    if ((!eligible && !cancellationEligible) || busy || uncertain || outcome || !booking.payment)
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ executed: boolean; approvalId?: string }>(
        cancellationEligible
          ? `/api/admin/bookings/${booking.id}/cancellation-approval`
          : '/api/admin/refunds',
        {
          method: 'POST',
          body: {
            bookingId: booking.id,
            amountKobo: booking.payment.grossAmount,
            reason: reason.trim(),
          },
        },
      );
      setOutcome(
        result.approvalId
          ? `Awaiting a second admin. Approval reference: ${result.approvalId}`
          : result.executed
            ? 'Refund recorded. Refresh the case to inspect the final status.'
            : 'Refund is processing. Refresh the case to follow its progress.',
      );
    } catch (e) {
      setUncertain(true);
      setError(
        `${e instanceof Error ? e.message : 'Could not confirm the outcome.'} Refresh this case and check refund records before another action.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notice">
      <h3>{booking.cancellation ? 'Cancellation settlement' : 'Full booking refund'}</h3>
      <p>
        {booking.cancellation
          ? 'Review the reserved client refund, net usher payout and commission above. Propose this exact settlement for a different admin to approve.'
          : 'Only a full held allocation can be refunded here. Disputed bookings must be resolved through the dispute case.'}
      </p>
      {eligible || cancellationEligible ? (
        <>
          <p>
            {cancellationEligible ? 'Total allocation under review' : 'Refund amount'}:{' '}
            <strong>{naira(booking.payment!.grossAmount)}</strong>
          </p>
          <label>
            Reason
            <textarea
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy || !!outcome || uncertain}
            />
          </label>
          <label className="action-row">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy || !!outcome || uncertain}
            />
            I reviewed the booking, amount and reason.
          </label>
          <Btn
            variant="danger"
            disabled={busy || !!outcome || uncertain || !reviewed || reason.trim().length < 3}
            onClick={() => {
              void refund();
            }}
          >
            {busy
              ? 'Submitting…'
              : cancellationEligible
                ? 'Propose cancellation settlement'
                : 'Request full refund'}
          </Btn>
        </>
      ) : (
        <p>No new refund is available for this booking’s current state.</p>
      )}
      {outcome ? (
        <p role="status">
          {outcome} <Link to="/approvals">Open approvals</Link>
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
