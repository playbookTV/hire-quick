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
  const { data, loading, error, reloadFresh } = useAsync<Approval[]>(() =>
    api('/api/admin/approvals?status=PENDING'),
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
            Requested by {selected.maker.phone} · {shortDate(selected.createdAt)}
          </p>
          <p>
            <strong>{naira(selected.amountKobo)}</strong> · Proposed outcome:{' '}
            {selected.payload.outcome ?? 'REFUND'}
          </p>
          <p className="whitespace-pre-wrap">
            {selected.payload.resolution ?? selected.payload.reason ?? 'No rationale supplied.'}
          </p>
          {selected.payload.bookingId ? (
            <BookingReview key={selected.id} id={selected.payload.bookingId}>
              {() => (
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
              )}
            </BookingReview>
          ) : (
            <p role="alert" className="notice notice-error">
              Booking reference missing. This request cannot be reviewed here.
            </p>
          )}
        </ReviewPanel>
      )}
      <Table head={['Kind', 'Amount', 'Requested by', 'Actions']}>
        {(data ?? []).map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2">{a.kind}</td>
            <td className="px-4 py-2">{naira(a.amountKobo)}</td>
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
            <td className="px-4 py-3 muted" colSpan={4}>
              Nothing awaiting a second admin.
            </td>
          </tr>
        )}
      </Table>
    </Page>
  );
}
