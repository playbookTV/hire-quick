import type { ReactNode } from 'react';
import { api, naira, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { State } from './ui';
export interface ReviewBooking {
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
                <dt>Usher payout</dt>
                <dd>
                  {naira(q.data.payment.usherPayout)} after {naira(q.data.payment.platformFee)}{' '}
                  platform fee
                </dd>
              </>
            )}
          </dl>
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
          {children(q.data)}
        </>
      )}
    </>
  );
}
