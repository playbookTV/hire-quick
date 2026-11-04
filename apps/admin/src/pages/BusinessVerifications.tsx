import { useEffect, useRef, useState } from 'react';
import { api, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Page, State, Table, Btn, EmptyRow, ReviewPanel } from '../components/ui';

interface BusinessRecord {
  id: string;
  registeredName: string;
  registrationNumber: string;
  businessType: string;
  representativeRole: string;
  status: string;
  registryStatus: string;
  registryName: string | null;
  environment: string;
  authorizationUrl: string | null;
  createdAt: string;
  reviewNote: string | null;
  client: { displayName: string; verificationStatus: string; verifications: { id: string }[] };
}

function BusinessReview({
  record,
  close,
  reload,
}: {
  record: BusinessRecord;
  close: () => void;
  reload: () => Promise<boolean>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const identityId = record.client.verifications[0]?.id;
  const identity = useAsync<{
    evidence: {
      fullName: string | null;
      submittedName: string | null;
      maskedId: string | null;
      expiresAt: string;
    } | null;
  }>(
    () =>
      identityId
        ? api(`/api/admin/verifications/${identityId}/evidence`)
        : Promise.resolve({ evidence: null }),
    identityId ?? '',
  );
  const [identityExpired, setIdentityExpired] = useState(false);
  const [evidenceDeadline, setEvidenceDeadline] = useState(0);
  useEffect(() => {
    setConfirmed(false);
    setIdentityExpired(false);
    if (!identity.data?.evidence) return;
    const timer = setTimeout(
      () => {
        setIdentityExpired(true);
        setConfirmed(false);
      },
      Math.max(0, new Date(identity.data.evidence.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [identity.data]);
  const verifiedName =
    !identityExpired && !identity.error && !identity.loading
      ? identity.data?.evidence?.fullName
      : null;
  useEffect(() => {
    if (verifiedName || identity.loading || Date.now() >= evidenceDeadline) return;
    const timer = setTimeout(identity.reload, 2000);
    return () => clearTimeout(timer);
  }, [verifiedName, identity.loading, identity.data, evidenceDeadline, identity.reload]);
  async function requestIdentityEvidence() {
    if (!identityId || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/verifications/${identityId}/evidence/refresh`, { method: 'POST' });
      setEvidenceDeadline(Date.now() + 30_000);
      identity.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh identity evidence.');
    } finally {
      setBusy(false);
    }
  }
  async function act(decision?: 'APPROVED' | 'REJECTED') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api(
        `/api/admin/business-verifications/${record.id}/${decision ? 'review' : 'refresh'}`,
        {
          method: 'POST',
          ...(decision ? { body: { decision, note, authorityConfirmed: confirmed } } : {}),
        },
      );
      if (await reload()) close();
      else setError('Request completed. Reload the records before taking another action.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the review.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ReviewPanel aria-label="Business verification">
      <Btn variant="ghost" disabled={busy} onClick={close}>
        Close review
      </Btn>
      <h2>{record.registeredName}</h2>
      <dl>
        <dt>CAC number</dt>
        <dd>{record.registrationNumber}</dd>
        <dt>Registry result</dt>
        <dd>
          {record.registryStatus} · {record.environment}
        </dd>
        <dt>Registry name</dt>
        <dd>{record.registryName ?? 'Not available'}</dd>
        <dt>Representative</dt>
        <dd>
          {record.client.displayName} · {record.representativeRole}
        </dd>
        <dt>Identity</dt>
        <dd>{record.client.verificationStatus}</dd>
        <dt>Verified identity name</dt>
        <dd>{verifiedName ?? 'Evidence unavailable. Reload before approving.'}</dd>
        <dt>Masked ID</dt>
        <dd>
          {!identityExpired ? (identity.data?.evidence?.maskedId ?? 'Not available') : 'Expired'}
        </dd>
      </dl>
      {record.authorizationUrl ? (
        <a href={record.authorizationUrl} target="_blank" rel="noreferrer">
          Open representative authority evidence
        </a>
      ) : (
        <p className="notice">Authority evidence is unavailable or has expired.</p>
      )}
      {record.status === 'PENDING' ? (
        <>
          <State loading={identity.loading} error={identity.error} onRetry={identity.reload} />
          <Btn
            variant="ghost"
            disabled={busy || identity.loading || !identityId}
            onClick={() => void requestIdentityEvidence()}
          >
            Refresh identity evidence
          </Btn>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !verifiedName}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I checked the representative's verified identity, the registry name, and their authority
            evidence.
          </label>
          <label htmlFor="business-review-note">Review note or rejection reason</label>
          <textarea
            id="business-review-note"
            value={note}
            disabled={busy}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <Btn
              disabled={
                busy ||
                !verifiedName ||
                !confirmed ||
                note.trim().length < 10 ||
                record.registryStatus !== 'VERIFIED' ||
                !record.authorizationUrl ||
                record.client.verificationStatus !== 'VERIFIED'
              }
              onClick={() => void act('APPROVED')}
            >
              Approve business
            </Btn>
            <Btn
              variant="ghost"
              disabled={busy || note.trim().length < 10}
              onClick={() => void act('REJECTED')}
            >
              Reject with reason
            </Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => void act()}>
              Refresh registry result
            </Btn>
          </div>
        </>
      ) : (
        <p>{record.reviewNote}</p>
      )}
    </ReviewPanel>
  );
}

export function BusinessVerifications({ onIdentity }: { onIdentity: () => void }) {
  const [status, setStatus] = useState('PENDING');
  const q = useAsync<BusinessRecord[]>(
    () => api(`/api/admin/business-verifications?status=${status}`),
    status,
  );
  const [selected, setSelected] = useState<BusinessRecord | null>(null);
  return (
    <Page
      title="Business verifications"
      actions={
        <Btn variant="ghost" disabled={!!selected} onClick={onIdentity}>
          Identity verifications
        </Btn>
      }
    >
      <label htmlFor="business-status">Show</label>
      <select
        id="business-status"
        value={status}
        disabled={!!selected}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <State loading={q.loading} error={q.error} onRetry={q.reload} />
      {selected ? (
        <BusinessReview
          key={selected.id}
          record={selected}
          close={() => setSelected(null)}
          reload={q.reloadFresh}
        />
      ) : null}
      <Table head={['Business', 'Representative', 'Registry', 'Submitted', 'Action']}>
        {q.data?.map((record) => (
          <tr key={record.id}>
            <td>{record.registeredName}</td>
            <td>{record.client.displayName}</td>
            <td>{record.registryStatus}</td>
            <td>{shortDate(record.createdAt)}</td>
            <td>
              <Btn
                variant="ghost"
                disabled={q.loading || !!q.error || !!selected}
                onClick={() => setSelected(record)}
              >
                Review business
              </Btn>
            </td>
          </tr>
        ))}
        {q.data?.length === 0 ? (
          <EmptyRow columns={5}>No {status.toLowerCase()} business verifications.</EmptyRow>
        ) : null}
      </Table>
    </Page>
  );
}
