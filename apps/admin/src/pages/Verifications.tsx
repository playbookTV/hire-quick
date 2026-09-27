import { reportSmile } from '../lib/monitoring';
import { useEffect, useRef, useState } from 'react';
import { api, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, EmptyRow, ReviewPanel } from '../components/ui';
interface Verif {
  id: string;
  status: string;
  method: string;
  provider: string | null;
  providerReferenceId?: string | null;
  govLookup: { providerJobId?: string; providerStatus?: string; environment?: string } | null;
  createdAt: string;
  idDocumentUrl: string | null;
  selfieUrl: string | null;
  usher: { user: { phone: string; email: string | null } };
}
interface ReviewEvidence {
  fullName: string | null;
  submittedName: string | null;
  maskedId: string | null;
  status: string;
  selfieUrl: string | null;
  idPhotoUrl: string | null;
  documentUrl: string | null;
  expiresAt: string;
}
function Evidence({
  url,
  label,
  onLoaded,
}: {
  url: string | null;
  label: string;
  onLoaded: (loaded: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <h3>{label}</h3>
      {url ? (
        <>
          {!failed ? (
            <img
              src={url}
              alt={label}
              referrerPolicy="no-referrer"
              onLoad={() => onLoaded(true)}
              onError={() => {
                setFailed(true);
                onLoaded(false);
              }}
            />
          ) : (
            <p className="notice notice-error">
              Image unavailable or expired. Refresh the evidence before approving.
            </p>
          )}
          <a href={url} target="_blank" rel="noreferrer">
            Open {label.toLowerCase()} in a new tab
          </a>
        </>
      ) : (
        <p className="notice">No {label.toLowerCase()} received.</p>
      )}
    </div>
  );
}
function IdentityReview({
  record,
  close,
  onDecision,
}: {
  record: Verif;
  close: () => void;
  onDecision: () => Promise<boolean>;
}) {
  const smile = record.provider === 'SMILE_ID';
  const jobId = record.govLookup?.providerJobId;
  const [evidence, setEvidence] = useState<ReviewEvidence | null>(null);
  const [loading, setLoading] = useState(smile && !!jobId);
  const [refreshing, setRefreshing] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [refreshRound, setRefreshRound] = useState(0);
  const [idLoaded, setIdLoaded] = useState(false);
  const [selfieLoaded, setSelfieLoaded] = useState(false);
  const [reason, setReason] = useState('');
  const [inspected, setInspected] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    if (!smile || !jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + (refreshRound ? 30_000 : 0);
    async function load() {
      try {
        const result = await api<{ evidence: ReviewEvidence | null }>(
          `/api/admin/verifications/${record.id}/evidence`,
        );
        if (!active) return;
        setEvidence(result.evidence);
        setEvidenceError('');
        if (!result.evidence && Date.now() < deadline) {
          timer = setTimeout(() => void load(), 2000);
          return;
        }
        if (!result.evidence && refreshRound) {
          reportSmile('SMILE_ADMIN_EVIDENCE_FAILED', record.providerReferenceId ?? undefined);
          setEvidenceError('Evidence has not arrived yet. Try refreshing again shortly.');
        }
      } catch (e) {
        if (active) reportSmile('SMILE_ADMIN_EVIDENCE_FAILED', record.providerReferenceId ?? undefined);
        if (active) setEvidenceError(e instanceof Error ? e.message : 'Could not load evidence.');
      }
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [record.id, record.providerReferenceId, smile, jobId, refreshRound]);
  useEffect(() => {
    if (!evidence) return;
    const timer = setTimeout(
      () => {
        setEvidence(null);
        setInspected(false);
        setIdLoaded(false);
        setSelfieLoaded(false);
        setEvidenceError('Evidence access expired. Refresh to continue reviewing.');
      },
      Math.max(0, Date.parse(evidence.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [evidence]);
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setRefreshing(true);
    setEvidence(null);
    setInspected(false);
    setIdLoaded(false);
    setSelfieLoaded(false);
    setEvidenceError('');
    try {
      await api(`/api/admin/verifications/${record.id}/evidence/refresh`, { method: 'POST' });
      setRefreshRound((n) => n + 1);
    } catch (e) {
      if (smile) reportSmile('SMILE_ADMIN_EVIDENCE_FAILED', record.providerReferenceId ?? undefined);
      setRefreshing(false);
      setEvidenceError(e instanceof Error ? e.message : 'Could not refresh evidence.');
    } finally {
      lock.current = false;
    }
  }
  async function act(action: 'approve' | 'reject') {
    if (lock.current || uncertain) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/verifications/${record.id}/${action}`, {
        method: 'POST',
        ...(action === 'reject' ? { body: { reason: reason.trim() } } : {}),
      });
      await onDecision();
      close();
    } catch (e) {
      if (smile) reportSmile('SMILE_ADMIN_REVIEW_FAILED', record.providerReferenceId ?? undefined);
      setError(e instanceof Error ? e.message : 'Couldn’t confirm the decision.');
      setUncertain(true);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const idUrl = smile
    ? evidence?.idPhotoUrl || evidence?.documentUrl || null
    : record.idDocumentUrl;
  const selfieUrl = smile ? (evidence?.selfieUrl ?? null) : record.selfieUrl;
  const canInspect =
    idLoaded &&
    selfieLoaded &&
    (!smile || (!!evidence && ['clear', 'attention', 'block'].includes(evidence.status)));
  return (
    <ReviewPanel aria-label="Identity review">
      <div className="page-heading">
        <h2>{record.usher.user.phone}</h2>
        <Btn variant="ghost" disabled={busy} onClick={close}>
          Close review
        </Btn>
      </div>
      <p className="muted">
        {smile ? 'Check started' : 'Submitted'} {shortDate(record.createdAt)} ·{' '}
        {record.usher.user.email ?? 'No email supplied'}
      </p>
      {smile && (
        <div className="notice">
          <p>
            <strong>
              {jobId
                ? `Verification result: ${record.govLookup?.providerStatus ?? 'Processing'}`
                : 'No identity evidence received'}
            </strong>
          </p>
          <p>
            {jobId
              ? 'Review the identity details and photos below.'
              : 'A capture session was started, but HireQuick has received no completed capture, identity photos, or verification result. There is nothing to review yet. The usher needs to complete identity verification in the app.'}
          </p>
          <p>
            {record.govLookup?.environment === 'sandbox'
              ? 'Sandbox test attempt — this does not establish a real identity.'
              : record.govLookup?.environment === 'production'
                ? 'Live verification'
                : 'Environment was not recorded for this older attempt.'}
          </p>
        </div>
      )}
      {smile && jobId && (
        <div className="action-row">
          <Btn
            variant="ghost"
            disabled={busy || loading || refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? 'Refreshing evidence…' : 'Refresh evidence'}
          </Btn>
          <span className="muted">Photos are available temporarily for this review.</span>
        </div>
      )}
      {loading && <p role="status">Loading identity evidence…</p>}
      {evidenceError && (
        <p className="notice notice-error" role="alert">
          {evidenceError}
        </p>
      )}
      {smile && jobId && !loading && !refreshing && !evidence && !evidenceError && (
        <p className="notice">
          Identity photos are not currently available. Refresh evidence to request them here.
        </p>
      )}
      {evidence && (
        <dl>
          <dt>Name on identity record</dt>
          <dd>{evidence.fullName ?? 'Not returned'}</dd>
          <dt>Name supplied by applicant</dt>
          <dd>{evidence.submittedName ?? 'Not returned'}</dd>
          <dt>ID number</dt>
          <dd>{evidence.maskedId ?? 'Not returned'}</dd>
        </dl>
      )}
      {(!smile || evidence) && (
        <div className="evidence-grid">
          <Evidence
            key={`id-${idUrl}`}
            url={idUrl}
            label={smile ? 'ID authority photo' : 'ID document'}
            onLoaded={setIdLoaded}
          />
          <Evidence
            key={`selfie-${selfieUrl}`}
            url={selfieUrl}
            label="Selfie"
            onLoaded={setSelfieLoaded}
          />
        </div>
      )}
      {record.status === 'PENDING' && (
        <>
          {canInspect && (
            <label className="action-row">
              <input
                type="checkbox"
                checked={inspected}
                disabled={busy}
                onChange={(e) => setInspected(e.target.checked)}
              />{' '}
              I have inspected the identity evidence shown here and confirmed that it matches.
            </label>
          )}
          {!canInspect && (
            <p className="muted">
              Approval is unavailable until both identity and selfie evidence can be viewed.
            </p>
          )}
          <label htmlFor="reason">Reason if rejecting</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            maxLength={500}
            placeholder="Explain what needs correcting so the usher can resubmit."
          />
          {error && (
            <p className="notice notice-error" role="alert">
              {error} Close this review and reload records before another decision.
            </p>
          )}
          <div className="action-row">
            <Btn
              disabled={busy || refreshing || uncertain || !canInspect || !inspected}
              onClick={() => void act('approve')}
            >
              {busy ? 'Saving decision…' : 'Approve identity'}
            </Btn>
            <Btn
              variant="danger"
              disabled={busy || refreshing || uncertain || reason.trim().length < 3}
              onClick={() => void act('reject')}
            >
              Reject with reason
            </Btn>
          </div>
        </>
      )}
    </ReviewPanel>
  );
}
export function Verifications() {
  const [status, setStatus] = useState('PENDING');
  const q = useAsync<Verif[]>(() => api(`/api/admin/verifications?status=${status}`), status);
  const [selected, setSelected] = useState<Verif | null>(null);
  return (
    <Page
      title="Identity verifications"
      actions={
        <Btn variant="ghost" disabled={q.loading || !!selected} onClick={q.reload}>
          Reload records
        </Btn>
      }
    >
      <p className="muted mb-5">
        Review identity details, photos, and verification results here before making a decision.
      </p>
      <label htmlFor="verification-status">Show</label>
      <select
        id="verification-status"
        value={status}
        disabled={!!selected}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {selected && (
        <IdentityReview
          key={selected.id}
          record={selected}
          close={() => setSelected(null)}
          onDecision={q.reloadFresh}
        />
      )}
      <Table head={['Usher', 'Evidence', 'Started / submitted', 'Action']}>
        {q.data?.map((v) => (
          <tr key={v.id}>
            <td>{v.usher.user.phone}</td>
            <td>
              {v.provider === 'SMILE_ID'
                ? v.govLookup?.providerJobId
                  ? `Result received · ${v.govLookup?.providerStatus ?? 'Processing'}`
                  : 'Capture started · no evidence received'
                : v.idDocumentUrl && v.selfieUrl
                  ? 'ID and selfie available'
                  : 'Documents incomplete'}
            </td>
            <td>{shortDate(v.createdAt)}</td>
            <td>
              <Btn
                variant="ghost"
                disabled={q.loading || !!q.error || !!selected}
                onClick={() => setSelected(v)}
              >
                Review identity
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.length === 0 && (
          <EmptyRow columns={4}>No {status.toLowerCase()} identity verifications.</EmptyRow>
        )}
      </Table>
    </Page>
  );
}
