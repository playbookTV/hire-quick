import { useState } from 'react';
import { formatNaira, kobo } from '@hq/shared';
import { api, shortDate } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Badge, Btn, EmptyRow, Page, ReviewPanel, State, Table } from '../components/ui';
import {
  EXCLUSION_LABEL,
  FLAG_HELP,
  FLAG_LABEL,
  RUN_STATUS_LABEL,
  lineAwaitsCode,
  lineStatus,
  runActions,
  type PayoutRunSummary,
  type PayoutRunView,
} from '../lib/payout-runs';

const naira = (amount: number) => formatNaira(kobo(amount));

const STATUS_HELP: Record<PayoutRunView['status'], string> = {
  DRAFT:
    'Check every line, flag and exclusion. Refresh if balances changed since the run was built, then submit it for a second admin.',
  AWAITING_APPROVAL:
    'A different admin from the one who submitted it must approve. Approving debits each wallet and starts the bank transfers.',
  APPROVED: 'Payouts are being created. Reload in a moment.',
  EXECUTED:
    'Transfers are with Paystack. While transfer codes are on, enter the code Paystack sends the account owner for each line.',
  CANCELLED: 'This payday was skipped. Balances roll over to the next run.',
};

export function Payouts() {
  const runs = useAsync<PayoutRunSummary[]>(() => api('/api/admin/payout-runs'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = useAsync<PayoutRunView | null>(
    () => (selectedId ? api(`/api/admin/payout-runs/${selectedId}`) : Promise.resolve(null)),
    selectedId ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});

  async function perform(label: string, request: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await request();
      if (done) setNotice(done);
      setReviewed(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Couldn’t ${label}. Reload the latest records.`);
    } finally {
      setBusy(false);
      runs.reload();
      run.reload();
    }
  }

  async function build() {
    await perform('build the run', async () => {
      const built = await api<PayoutRunView>('/api/admin/payout-runs/build', { method: 'POST' });
      setSelectedId(built.id);
    }, 'Run built from current wallet balances.');
  }

  const current = run.data;
  const allowed = current ? runActions(current) : null;
  const post = (path: string, body?: unknown) =>
    api(`/api/admin/payout-runs/${current?.id ?? ''}${path}`, { method: 'POST', body });

  return (
    <Page
      title="Weekly payouts"
      actions={
        <Btn disabled={busy} onClick={() => void build()}>
          Build or refresh today’s run
        </Btn>
      }
    >
      <p className="mb-4 -mt-3 text-sm text-slate-500">
        Ushers are paid every Thursday. The worker builds the run at 09:00 Lagos time; one admin
        submits it and a different admin approves it.
      </p>
      <State loading={runs.loading} error={runs.error} onRetry={runs.reload} />
      {actionError ? (
        <p role="alert" className="notice notice-error">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}

      {selectedId && (
        <ReviewPanel aria-label="Payout run review">
          <div className="page-heading">
            <h2>Payday {current?.periodKey ?? ''}</h2>
            <Btn variant="ghost" disabled={busy} onClick={() => setSelectedId(null)}>
              Close run
            </Btn>
          </div>
          <State loading={run.loading} error={run.error} onRetry={run.reload} />
          {current && allowed ? (
            <>
              <p>
                <strong>{naira(current.totalKobo)}</strong> to {current.lines.length} usher
                {current.lines.length === 1 ? '' : 's'} · {RUN_STATUS_LABEL[current.status]} · built{' '}
                {shortDate(current.builtAt)}
              </p>
              <p className="muted">
                {current.submittedBy ? `Submitted by ${current.submittedBy}` : 'Not submitted'}
                {current.approvedBy ? ` · approved by ${current.approvedBy}` : ''}
                {current.status === 'EXECUTED'
                  ? ` · ${current.summary.paid} paid, ${current.summary.processing} in progress, ${current.summary.failed} failed, ${current.summary.notSent} not sent`
                  : ''}
              </p>
              <p className="notice">{STATUS_HELP[current.status]}</p>

              {(allowed.submit || allowed.approve) && (
                <label className="action-row">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />{' '}
                  I have checked every line, flag, exclusion and the total.
                </label>
              )}
              <div className="action-row">
                {allowed.refresh && (
                  <Btn variant="ghost" disabled={busy} onClick={() => void build()}>
                    Refresh from current balances
                  </Btn>
                )}
                {allowed.submit && (
                  <Btn
                    disabled={busy || !reviewed}
                    onClick={() =>
                      void perform('submit the run', () => post('/submit', { linesHash: current.linesHash }), 'Submitted for a second admin.')
                    }
                  >
                    Submit for approval
                  </Btn>
                )}
                {allowed.approve && (
                  <Btn
                    disabled={busy || !reviewed}
                    onClick={() =>
                      void perform('approve the run', () => post('/approve', { linesHash: current.linesHash }), 'Approved. Wallets are debited and transfers are starting.')
                    }
                  >
                    Approve and send payouts
                  </Btn>
                )}
                {allowed.sendBack && (
                  <Btn variant="danger" disabled={busy} onClick={() => void perform('send the run back', () => post('/reject'), 'Sent back to draft.')}>
                    Send back to draft
                  </Btn>
                )}
                {allowed.cancel && (
                  <Btn variant="danger" disabled={busy} onClick={() => void perform('skip this payday', () => post('/cancel'), 'Payday skipped. Balances roll over.')}>
                    Skip this payday
                  </Btn>
                )}
                {allowed.sendAgain && (
                  <Btn variant="ghost" disabled={busy} onClick={() => void perform('restart transfers', () => post('/dispatch'), 'Starting any transfer that has not reached Paystack.')}>
                    Send unsent transfers again
                  </Btn>
                )}
                <Btn variant="ghost" disabled={busy || run.loading} onClick={run.reload}>
                  Reload run
                </Btn>
              </div>

              <h3 className="mt-6 mb-2">Payouts</h3>
              <Table head={['Usher', 'Payout account', 'Amount', 'Check', 'Status', 'Transfer code']}>
                {current.lines.map((line) => (
                  <tr key={line.usherId}>
                    <td>{line.usherName}</td>
                    <td>
                      {line.bank
                        ? `${line.bank.accountName} · ${line.bank.bankCode} ••${line.bank.last4}`
                        : 'Account removed'}
                    </td>
                    <td className="tabular-nums">{naira(line.amountKobo)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {line.flags.map((flag) => (
                          <span key={flag} title={FLAG_HELP[flag]}>
                            <Badge>{FLAG_LABEL[flag]}</Badge>
                            <span className="sr-only">: {FLAG_HELP[flag]}</span>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>{lineStatus(line, current.status)}</td>
                    <td>
                      {lineAwaitsCode(line) && line.withdrawal ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const withdrawalId = line.withdrawal!.id;
                            const otp = codes[withdrawalId] ?? '';
                            void perform(
                              'submit the code',
                              async () => {
                                await post(`/lines/${withdrawalId}/otp`, { otp });
                                setCodes((all) => ({ ...all, [withdrawalId]: '' }));
                              },
                              'Code accepted. Paystack will confirm the transfer.',
                            );
                          }}
                        >
                          <label className="sr-only" htmlFor={`otp-${line.withdrawal.id}`}>
                            Transfer code for {line.usherName}
                          </label>
                          <input
                            id={`otp-${line.withdrawal.id}`}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="\d{4,8}"
                            maxLength={8}
                            size={8}
                            className="w-28"
                            value={codes[line.withdrawal.id] ?? ''}
                            onChange={(e) =>
                              setCodes((all) => ({ ...all, [line.withdrawal!.id]: e.target.value.replace(/\D/g, '') }))
                            }
                            disabled={busy}
                          />
                          <Btn type="submit" disabled={busy || (codes[line.withdrawal.id] ?? '').length < 4}>
                            Submit code
                          </Btn>
                          <Btn
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void perform('send a new code', () => post(`/lines/${line.withdrawal!.id}/resend-otp`), 'Paystack is sending a new code to the account owner.')
                            }
                          >
                            Send new code
                          </Btn>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {current.lines.length === 0 && <EmptyRow columns={6}>Nobody is due a payout.</EmptyRow>}
              </Table>

              <h3 className="mt-6 mb-2">Not included this week</h3>
              <Table head={['Usher', 'Wallet balance', 'Reason']}>
                {current.excluded.map((e) => (
                  <tr key={e.usherId}>
                    <td>{e.usherName}</td>
                    <td className="tabular-nums">{naira(e.balanceKobo)}</td>
                    <td>{EXCLUSION_LABEL[e.reason]}</td>
                  </tr>
                ))}
                {current.excluded.length === 0 && <EmptyRow columns={3}>Every usher with a balance is included.</EmptyRow>}
              </Table>
            </>
          ) : null}
        </ReviewPanel>
      )}

      <Table head={['Payday', 'Status', 'Ushers', 'Total', 'Actions']}>
        {(runs.data ?? []).map((r) => (
          <tr key={r.id}>
            <td>{r.periodKey}</td>
            <td>{RUN_STATUS_LABEL[r.status]}</td>
            <td className="tabular-nums">{r.lineCount}</td>
            <td className="tabular-nums">{naira(r.totalKobo)}</td>
            <td>
              <Btn
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSelectedId(r.id);
                  setReviewed(false);
                  setActionError(null);
                  setNotice(null);
                }}
              >
                Open run
              </Btn>
            </td>
          </tr>
        ))}
        {runs.data && runs.data.length === 0 && (
          <EmptyRow columns={5}>No payout runs yet. The first one is built on Thursday at 09:00.</EmptyRow>
        )}
      </Table>
    </Page>
  );
}
