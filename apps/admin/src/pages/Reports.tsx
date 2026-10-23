import { useRef, useState } from 'react';
import { REPORT_STATUSES } from '@hq/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, Badge, EmptyRow, ReviewPanel } from '../components/ui';

type Status = (typeof REPORT_STATUSES)[number];
interface Report {
  id: string;
  reporterId: string;
  reason: string;
  details: string;
  status: Status;
  reviewNote: string | null;
  createdAt: string;
  event: { id: string; title: string; category: string; client: { userId: string } } | null;
  usher: { id: string; displayName: string | null; userId: string } | null;
}
export function Reports() {
  const [status, setStatus] = useState<Status>('OPEN');
  const [cursor, setCursor] = useState<string | null>(null);
  const q = useAsync<{ items: Report[]; nextCursor: string | null }>(
    () => api(`/api/admin/reports?status=${status}${cursor ? `&cursor=${cursor}` : ''}`),
    `${status}:${cursor}`,
  );
  const policies = useAsync<{ category: string; enabled: boolean }[]>(() =>
    api('/api/admin/presentation-policies'),
  );
  const [selected, setSelected] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<Exclude<Status, 'OPEN'>>('UNDER_REVIEW');
  const [category, setCategory] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState('');
  async function saveReview() {
    if (!selected || lock.current || note.trim().length < 3) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await api(`/api/admin/reports/${selected.id}`, {
        method: 'PATCH',
        body: { expectedStatus: selected.status, status: outcome, note: note.trim() },
      });
      setNotice('Review saved.');
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : 'Could not save review. Reload and check the current status.',
      );
    } finally {
      setSelected(null);
      await q.reloadFresh();
      lock.current = false;
      setBusy(false);
    }
  }
  async function savePolicy() {
    if (lock.current || category.trim().length < 2) return;
    lock.current = true;
    setBusy(true);
    try {
      await api('/api/admin/presentation-policies', {
        method: 'PUT',
        body: { category: category.trim(), enabled },
      });
      setNotice('Category preference policy saved.');
      await policies.reloadFresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save policy.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Page
      title="Marketplace reports"
      actions={
        <Btn
          variant="ghost"
          disabled={busy || q.loading}
          onClick={() => {
            setSelected(null);
            q.reload();
          }}
        >
          Reload reports
        </Btn>
      }
    >
      <p className="muted mb-5">
        Concerns about jobs or workers, including before booking. Reviewing a report does not move
        funds. Account restrictions are managed in Users.
      </p>
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
      <label htmlFor="report-status">Report status</label>
      <select
        id="report-status"
        value={status}
        disabled={busy}
        onChange={(e) => {
          setStatus(e.target.value as Status);
          setCursor(null);
          setSelected(null);
        }}
      >
        {REPORT_STATUSES.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {selected ? (
        <ReviewPanel aria-label="Report review">
          <h2>{selected.event?.title ?? selected.usher?.displayName ?? 'Worker report'}</h2>
          <p>
            <strong>{selected.reason}</strong>
          </p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selected.details}</p>
          <p style={{ overflowWrap: 'anywhere' }}>Reporter account: {selected.reporterId}</p>
          <p style={{ overflowWrap: 'anywhere' }}>
            Reported account: {selected.event?.client.userId ?? selected.usher?.userId}
          </p>
          {selected.reviewNote ? (
            <p style={{ overflowWrap: 'anywhere' }}>Previous review: {selected.reviewNote}</p>
          ) : null}
          {['OPEN', 'UNDER_REVIEW'].includes(selected.status) ? (
            <>
              <label htmlFor="report-outcome">Review status</label>
              <select
                id="report-outcome"
                disabled={busy}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as Exclude<Status, 'OPEN'>)}
              >
                {selected.status === 'OPEN' ? (
                  <option value="UNDER_REVIEW">Under review</option>
                ) : null}
                <option value="RESOLVED">Resolved</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
              <label htmlFor="report-note">Reason and action taken</label>
              <textarea
                id="report-note"
                value={note}
                disabled={busy}
                minLength={3}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
              <Btn
                disabled={busy || q.loading || !!q.error || note.trim().length < 3}
                onClick={() => void saveReview()}
              >
                {busy ? 'Saving…' : 'Save review'}
              </Btn>
            </>
          ) : null}
          <Btn variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
            Close review
          </Btn>
        </ReviewPanel>
      ) : null}
      <Table head={['Reported item', 'Reason', 'Received', 'Status', 'Action']}>
        {q.data?.items.map((report) => (
          <tr key={report.id}>
            <td>{report.event?.title ?? report.usher?.displayName ?? 'Worker'}</td>
            <td>{report.reason}</td>
            <td>{new Date(report.createdAt).toLocaleString()}</td>
            <td>
              <Badge>{report.status}</Badge>
            </td>
            <td>
              <Btn
                variant="ghost"
                disabled={busy || q.loading || !!q.error}
                onClick={() => {
                  setSelected(report);
                  setNote('');
                  setOutcome(report.status === 'OPEN' ? 'UNDER_REVIEW' : 'RESOLVED');
                }}
              >
                Review
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.items.length === 0 ? (
          <EmptyRow columns={5}>No reports with this status.</EmptyRow>
        ) : null}
      </Table>
      {cursor ? (
        <Btn
          variant="ghost"
          disabled={busy || q.loading}
          onClick={() => {
            setCursor(null);
            setSelected(null);
          }}
        >
          First page
        </Btn>
      ) : null}
      {q.data?.nextCursor ? (
        <Btn
          disabled={busy || q.loading || !!q.error}
          onClick={() => {
            setCursor(q.data!.nextCursor);
            setSelected(null);
          }}
        >
          Next page
        </Btn>
      ) : null}
      <section className="mt-6">
        <h2>Physical preferences by event category</h2>
        <p>
          Categories allow preferences by default. Disabling a category blocks new or edited
          preferences; existing jobs remain available for review.
        </p>
        <State loading={policies.loading} error={policies.error} onRetry={policies.reload} />
        <ul>
          {policies.data?.map((policy) => (
            <li key={policy.category}>
              {policy.category}: {policy.enabled ? 'Allowed' : 'Disabled'}
            </li>
          ))}
        </ul>
        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <label htmlFor="policy-category">Event category</label>
          <input
            id="policy-category"
            value={category}
            maxLength={60}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            placeholder="e.g. Wedding"
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />{' '}
            Allow physical preferences
          </label>
          <Btn disabled={busy || category.trim().length < 2} onClick={() => void savePolicy()}>
            Save category policy
          </Btn>
        </div>
      </section>
    </Page>
  );
}
