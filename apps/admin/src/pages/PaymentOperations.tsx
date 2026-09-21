import { useState } from 'react';
import { api, naira, shortDate } from '../lib/api';
import { useRecords } from '../lib/useRecords';
import { Page, State, Table, Badge, Btn, EmptyRow, Pagination } from '../components/ui';
interface Operation {
  id: string;
  kind: string;
  status: string;
  providerRef: string | null;
  attempts: number;
  recoveryAttempts: number;
  nextAttemptAt: string | null;
  quarantinedAt: string | null;
  lastError: string | null;
}
interface Run {
  id: string;
  target: string;
  action: string;
  createdAt: string;
  metadata: {
    classification?: string;
    driftKobo?: number;
    expectedKobo?: number;
    actualKobo?: number;
    pendingOperations?: number;
    quarantinedOperations?: number;
    staleHeldBookingIds?: string[];
    staleFrozenBookingIds?: string[];
    message?: string;
  };
  review: { metadata: { outcome: string; evidence: string } } | null;
}
export function PaymentOperations() {
  const operations = useRecords<Operation>('/api/admin/payment-operations', '');
  const runs = useRecords<Run>('/api/admin/reconciliation-runs', '');
  const [selected, setSelected] = useState<{ path: string; action: string; title: string } | null>(
    null,
  );
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const select = (path: string, action: string, title: string) => {
    setSelected({ path, action, title });
    setEvidence('');
    setError(null);
  };
  async function submit() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(selected.path, {
        method: 'POST',
        body: {
          ...(selected.path.includes('payment-operations')
            ? { action: selected.action }
            : { outcome: selected.action }),
          evidence,
        },
      });
      setSelected(null);
      operations.reload();
      runs.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="Payment operations"
      actions={
        <Btn
          disabled={busy}
          onClick={() => {
            operations.reload();
            runs.reload();
          }}
        >
          Refresh
        </Btn>
      }
    >
      <p className="muted mb-5">
        Review unresolved payments and balance checks. Resuming recovery checks the existing payment
        evidence; it does not authorize a new refund. Quarantine pauses automatic recovery for that
        operation; provider callbacks can still settle it.
      </p>
      {selected && (
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            {selected.title}
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={evidence}
              disabled={busy}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Record provider evidence, investigation and next steps"
            />
          </label>
          <Btn type="submit" disabled={busy || evidence.trim().length < 10}>
            {busy ? 'Saving…' : 'Save review'}
          </Btn>
          <Btn disabled={busy} onClick={() => setSelected(null)}>
            Cancel
          </Btn>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <h2>Unresolved payments</h2>
      <State loading={operations.loading} error={operations.error} onRetry={operations.reload} />
      <Table head={['Operation', 'Status', 'Recovery', 'Evidence', 'Actions']}>
        {operations.data?.items.map((op) => (
          <tr key={op.id}>
            <td>
              {op.kind}
              <small className="block">{op.id}</small>
            </td>
            <td>
              <Badge>{op.status}</Badge>
              {op.quarantinedAt && <p>Needs operator review</p>}
            </td>
            <td>
              {op.recoveryAttempts} recovery attempts
              <p>
                {op.quarantinedAt
                  ? 'Automatic recovery paused'
                  : op.nextAttemptAt
                    ? `Next check: ${shortDate(op.nextAttemptAt)}`
                    : 'Awaiting first recovery check'}
              </p>
            </td>
            <td>
              {op.providerRef ?? 'No provider reference'}
              <p>{op.lastError}</p>
            </td>
            <td>
              <Btn
                disabled={busy}
                onClick={() =>
                  select(
                    `/api/admin/payment-operations/${op.id}/review`,
                    op.quarantinedAt ? 'resume' : 'quarantine',
                    `${op.quarantinedAt ? 'Resume' : 'Quarantine'} ${op.id}`,
                  )
                }
              >
                {op.quarantinedAt ? 'Resume recovery' : 'Quarantine'}
              </Btn>
            </td>
          </tr>
        ))}
        {operations.data?.items.length === 0 && (
          <EmptyRow columns={5}>No unresolved payment operations.</EmptyRow>
        )}
      </Table>
      <Pagination
        hasNext={!!operations.data?.nextCursor && !operations.error}
        hasPrevious={operations.hasPrevious}
        loading={operations.loading}
        onNext={operations.next}
        onPrevious={operations.previous}
      />
      <h2>Reconciliation history</h2>
      <p className="muted">
        In-flight checks need a later sample. Fees, top-ups and provider settlements require account
        evidence before explaining a difference.
      </p>
      <State loading={runs.loading} error={runs.error} onRetry={runs.reload} />
      <Table head={['When', 'Balance check', 'Review needs', 'Investigation']}>
        {runs.data?.items.map((run) => (
          <tr key={run.id}>
            <td>{shortDate(run.createdAt)}</td>
            <td>
              <Badge>{run.metadata.classification ?? 'Check failed'}</Badge>
              <p>
                {run.metadata.driftKobo === undefined
                  ? run.metadata.message
                  : `Difference: ${naira(run.metadata.driftKobo)}`}
              </p>
              <details>
                <summary>Recorded evidence</summary>
                <pre>{JSON.stringify(run.metadata, null, 2)}</pre>
              </details>
            </td>
            <td>
              {run.metadata.pendingOperations ?? 0} pending;{' '}
              {run.metadata.quarantinedOperations ?? 0} quarantined
              <p>
                {run.metadata.staleHeldBookingIds?.length ?? 0} aged held;{' '}
                {run.metadata.staleFrozenBookingIds?.length ?? 0} aged frozen
              </p>
            </td>
            <td>
              {run.review && (
                <p>
                  {run.review.metadata.outcome}: {run.review.metadata.evidence}
                </p>
              )}
              {(['investigating', 'explained', 'resolved'] as const).map((outcome) => (
                <Btn
                  key={outcome}
                  disabled={busy}
                  onClick={() =>
                    select(
                      `/api/admin/reconciliation-runs/${run.target}/review`,
                      outcome,
                      `Mark run ${outcome}`,
                    )
                  }
                >
                  {outcome}
                </Btn>
              ))}
            </td>
          </tr>
        ))}
        {runs.data?.items.length === 0 && (
          <EmptyRow columns={4}>No reconciliation runs recorded yet.</EmptyRow>
        )}
      </Table>
      <Pagination
        hasNext={!!runs.data?.nextCursor && !runs.error}
        hasPrevious={runs.hasPrevious}
        loading={runs.loading}
        onNext={runs.next}
        onPrevious={runs.previous}
      />
    </Page>
  );
}
