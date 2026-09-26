import { ReviewPanel } from '../components/ui';
import { api, naira, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn } from '../components/ui';
import { BookingReview } from '../components/BookingReview';
import { useState } from 'react';
import { createApprovalActions } from '../lib/approval-actions';

interface Approval {
  id: string;
  kind: string;
  status: string;
  checker: { phone: string } | null;
  updatedAt: string;
  amountKobo: number;
  maker: { phone: string };
  createdAt: string;
  payload: {
    bookingId?: string;
    disputeId?: string;
    outcome?: string;
    resolution?: string;
    reason?: string;
  };
}

export function Approvals() {
  const [status, setStatus] = useState('PENDING');
  const { data, loading, error, reloadFresh } = useAsync<Approval[]>(
    () => api(`/api/admin/approvals?status=${status}`),
    status,
  );
  const [actions] = useState(() =>
    createApprovalActions(
      (id, decision) => api(`/api/admin/approvals/${id}`, { method: 'POST', body: { decision } }),
      reloadFresh,
    ),
  );
  const [selected, setSelected] = useState<Approval | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, redraw] = useState(0);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setActionError(null);
    const result = actions.submit(id, decision);
    redraw((version) => version + 1);
    try {
      await result;
      setSelected(null);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : 'Couldn’t confirm this decision. Reload the latest records.',
      );
    } finally {
      redraw((version) => version + 1);
    }
  }

  return (
    <Page
      title="Approvals (maker-checker)"
      actions={
        <Btn
          disabled={loading}
          onClick={() => {
            const result = actions.reload();
            redraw((version) => version + 1);
            void result
              .then((fresh) => {
                if (fresh) {
                  setActionError(null);
                  setSelected(null);
                }
              })
              .finally(() => {
                redraw((version) => version + 1);
              });
          }}
        >
          Reload records
        </Btn>
      }
    >
      <p className="mb-4 -mt-3 text-sm text-slate-500">
        Money moves above the threshold need a second admin. You can&apos;t approve a request you
        made.
      </p>
      <label className="action-row">
        Decision status
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setSelected(null);
          }}
        >
          <option value="PENDING">Awaiting second admin</option>
          <option value="APPROVED">Approved · processing</option>
          <option value="EXECUTED">Executed</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </label>
      <State loading={loading} error={error} />
      {actionError ? (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {actionError}
        </p>
      ) : null}
      {selected && (
        <ReviewPanel aria-label="Approval review">
          <div className="page-heading">
            <h2>Review {selected.kind.toLowerCase().replaceAll('_', ' ')}</h2>
            <Btn
              variant="ghost"
              disabled={actions.disabled(selected.id)}
              onClick={() => setSelected(null)}
            >
              Close review
            </Btn>
          </div>
          <p>
            {selected.status} · Requested by {selected.maker.phone} ·{' '}
            {shortDate(selected.createdAt)}
          </p>
          <p>
            <strong>{naira(selected.amountKobo)}</strong> · Proposed outcome:{' '}
            {selected.payload.outcome === 'CLIENT_CANCELLATION'
              ? 'Client cancellation split (total allocation shown)'
              : (selected.payload.outcome ?? 'REFUND')}
          </p>
          <p className="whitespace-pre-wrap">
            {selected.payload.resolution ?? selected.payload.reason ?? 'No rationale supplied.'}
          </p>
          <p>
            {selected.checker
              ? `Decision by ${selected.checker.phone} · ${shortDate(selected.updatedAt)}`
              : 'Awaiting a checker decision'}
          </p>
          {selected.status === 'APPROVED' ? (
            <p className="notice">
              Approved and processing. Execution is not yet complete. Reload to check the outcome.
            </p>
          ) : null}
          {selected.status === 'REJECTED' ? (
            <p className="notice">
              Rejected. Dispute proposals can be revised from the open case once no other proposal
              is pending. Rejected cancellation proposals leave the original request reserved;
              propose a revised review from its booking case.
            </p>
          ) : null}
          {selected.payload.bookingId ? (
            <BookingReview key={selected.id} id={selected.payload.bookingId}>
              {() =>
                selected.status === 'PENDING' ? (
                  <>
                    <label className="action-row">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                        disabled={actions.disabled(selected.id)}
                      />{' '}
                      I have reviewed the case, amount, and proposed outcome.
                    </label>
                    <div className="action-row">
                      <Btn
                        disabled={!reviewed || loading || !!error || actions.disabled(selected.id)}
                        onClick={() => void decide(selected.id, 'approve')}
                      >
                        Approve proposed action
                      </Btn>
                      <Btn
                        disabled={!reviewed || loading || !!error || actions.disabled(selected.id)}
                        variant="danger"
                        onClick={() => void decide(selected.id, 'reject')}
                      >
                        Reject proposed action
                      </Btn>
                    </div>
                  </>
                ) : null
              }
            </BookingReview>
          ) : (
            <p role="alert" className="notice notice-error">
              Booking reference missing. This request cannot be reviewed here.
            </p>
          )}
        </ReviewPanel>
      )}
      <Table head={['Kind', 'Amount', 'Status', 'Requested by', 'Actions']}>
        {(data ?? []).map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2">{a.kind}</td>
            <td className="px-4 py-2">{naira(a.amountKobo)}</td>
            <td className="px-4 py-2">
              {a.status === 'APPROVED' ? 'Approved · processing' : a.status}
            </td>
            <td className="px-4 py-2">{a.maker.phone}</td>
            <td className="space-x-2 px-4 py-2">
              <Btn
                disabled={loading || !!error || actions.disabled(a.id)}
                variant="ghost"
                onClick={() => {
                  setSelected(a);
                  setReviewed(false);
                }}
              >
                Review request
              </Btn>
            </td>
          </tr>
        ))}
        {data && data.length === 0 && (
          <tr>
            <td className="px-4 py-3 muted" colSpan={5}>
              No records with this status.
            </td>
          </tr>
        )}
      </Table>
    </Page>
  );
}
