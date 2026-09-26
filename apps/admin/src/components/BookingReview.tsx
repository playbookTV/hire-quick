import type { CancellationSummary } from '@hq/shared';
import type { ReactNode } from 'react';
import { api, naira, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { State } from './ui';
export interface ReviewBooking {
  payoutAvailableAt?: string;
  cancellation?: CancellationSummary | null;
  id: string;
  status: string;
  amount: number;
  attendanceMethod: string | null;
  arrivalAssertedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  event: {
    title: string;
    venue: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    client: { user: { phone: string } };
  };
  usher: { displayName: string; user: { phone: string } };
  payment: {
    grossAmount: number;
    usherPayout: number;
    platformFee: number;
    escrowStatus: string;
  } | null;
  messages?: Array<{
    id: string;
    sender: string;
    contentType: string;
    content: string | null;
    createdAt: string;
    mediaUrl: string | null;
  }>;
  refund?: { id: string; status: string; providerRef: string | null; updatedAt: string } | null;
  refundApprovals?: Array<{ id: string; status: string; amountKobo: number; updatedAt: string }>;
  disputes: Array<{
    id: string;
    reason: string;
    note: string | null;
    status: string;
    resolution: string | null;
    createdAt: string;
    raisedBy: { phone: string };
  }>;
}
export function BookingReview({
  id,
  children,
}: {
  id: string;
  children: (booking: ReviewBooking) => ReactNode;
}) {
  const q = useAsync<ReviewBooking>(
    () => api(`/api/admin/bookings/${encodeURIComponent(id)}/review`),
    id,
  );
  return (
    <>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {!q.loading && !q.error && q.data && (
        <>
          <h2>{q.data.event.title}</h2>
          <dl>
            <dt>Booking</dt>
            <dd>
              {q.data.id} · {q.data.status}
            </dd>
            <dt>Event</dt>
            <dd>
              {shortDate(q.data.event.eventDate).split(',')[0]} · {q.data.event.startTime}–
              {q.data.event.endTime} · {q.data.event.venue}
            </dd>
            <dt>Client</dt>
            <dd>{q.data.event.client.user.phone}</dd>
            <dt>Usher</dt>
            <dd>
              {q.data.usher.displayName} · {q.data.usher.user.phone}
            </dd>
            <dt>Attendance</dt>
            <dd>
              {q.data.checkedInAt
                ? `${shortDate(q.data.checkedInAt)} (${q.data.attendanceMethod ?? 'method unavailable'})`
                : 'No verified check-in recorded'}
            </dd>
            <dt>Arrival claimed</dt>
            <dd>
              {q.data.arrivalAssertedAt ? shortDate(q.data.arrivalAssertedAt) : 'Not recorded'}
            </dd>
            <dt>Completed</dt>
            <dd>{q.data.completedAt ? shortDate(q.data.completedAt) : 'Not recorded'}</dd>
            <dt>Payment</dt>
            <dd>
              {q.data.payment
                ? `${naira(q.data.payment.grossAmount)} · ${q.data.payment.escrowStatus}`
                : 'No payment recorded'}
            </dd>
            {q.data.payment && (
              <>
                <dt>Net usher payout</dt>
                <dd>
                  {naira(q.data.cancellation?.usherPayoutKobo ?? q.data.payment.usherPayout)} after{' '}
                  {naira(q.data.cancellation?.platformFeeKobo ?? q.data.payment.platformFee)}{' '}
                  platform fee
                </dd>
              </>
            )}
          </dl>
          {q.data.payoutAvailableAt &&
            ['HELD', 'FROZEN'].includes(q.data.payment?.escrowStatus ?? '') && (
              <p className="notice">
                Completed work remains held until{' '}
                {new Date(q.data.payoutAvailableAt).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}{' '}
                WAT. Unresolved disputes delay wallet release.
              </p>
            )}
          {q.data.cancellation && (
            <div className="notice">
              <strong>
                Client cancellation · {q.data.cancellation.status.replaceAll('_', ' ')}
              </strong>
              <p>
                Requested {shortDate(q.data.cancellation.requestedAt)}. The original time and split
                remain reserved during review.
              </p>
              <p>
                Client refund: {naira(q.data.cancellation.refundKobo)}. Gross usher allocation:{' '}
                {naira(q.data.cancellation.usherCompensationKobo)}. Platform commission:{' '}
                {naira(q.data.cancellation.platformFeeKobo)}. Net usher payout:{' '}
                {naira(q.data.cancellation.usherPayoutKobo)}.
              </p>
              <p>No processing fee is deducted from the client refund.</p>
            </div>
          )}
          {q.data.disputes.map((d) => (
            <div className="notice" key={d.id}>
              <strong>
                {d.reason} · {d.status}
              </strong>
              <p>
                Raised by {d.raisedBy.phone} · {shortDate(d.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{d.note || 'No supporting note supplied.'}</p>
              {d.resolution && <p>Resolution: {d.resolution}</p>}
            </div>
          ))}
          {q.data.refund && !q.data.cancellation ? (
            <p className="notice">
              Refund {q.data.refund.status} · {q.data.refund.providerRef ?? q.data.refund.id} ·{' '}
              {shortDate(q.data.refund.updatedAt)}
            </p>
          ) : null}
          {(q.data.refundApprovals ?? []).map((a) => (
            <p className="notice" key={a.id}>
              Refund approval {a.status} · {naira(a.amountKobo)} · {a.id}
            </p>
          ))}
          <h3>Booking conversation</h3>
          {(q.data.messages ?? []).length === 0 ? (
            <p className="muted">No retained messages.</p>
          ) : null}
          {(q.data.messages ?? []).map((m) => (
            <div className="notice" key={m.id}>
              <strong>
                {m.sender} · {shortDate(m.createdAt)}
              </strong>
              {m.content ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : m.mediaUrl ? (
                m.contentType === 'IMAGE' ? (
                  <img
                    src={m.mediaUrl}
                    alt="Booking evidence photo"
                    style={{ maxWidth: '100%', maxHeight: 320 }}
                  />
                ) : (
                  <audio src={m.mediaUrl} controls />
                )
              ) : (
                <p>Attachment unavailable.</p>
              )}
            </div>
          ))}
          {children(q.data)}
        </>
      )}
    </>
  );
}
