# Operations and incident runbooks

[Documentation index](README.md) · [Payments](PAYMENTS.md) · [Deployment](DEPLOYMENT.md)

## Establish the affected environment

Record the revision, API/worker versions, relevant UTC timestamps, request ID if available, and entity/provider reference. Keep customer and credential data in restricted incident records. First distinguish API availability, worker availability, provider state, and client display state: each can fail independently.

`/health` is HTTP liveness only. `/ready` checks database and Redis connectivity; it does not establish queue health, provider availability, or ledger reconciliation. Inspect both API and worker logs. [Observability](OBSERVABILITY.md) describes the error reporting and heartbeat hooks and the separate steps required to activate hosted alerts.

## Background jobs

Source: [queues.ts](../apps/api/src/modules/jobs/queues.ts), [runtime.ts](../apps/api/src/modules/jobs/runtime.ts), and [jobs.ts](../apps/api/src/modules/jobs/jobs.ts). Each schedule uses a separate `hirequick-jobs-<job>` queue; the legacy `hirequick-jobs` queue drains existing work. Registration deduplicates identical repeat options. Completed jobs are removed; up to 100 failed jobs are retained per queue. Schedules explicitly use UTC.

| Job              | Cron pattern      | Purpose / checks                                                                             |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `autocomplete`   | `*/10 * * * *`    | Eligible verified/arrived bookings after event end + grace; wallet release                   |
| `noshow`         | `3-59/10 * * * *` | Confirmed absent bookings after start + grace; refund handling                               |
| `checkouts`      | `2-59/5 * * * *`  | Verify checkout outcomes; expire only conclusively unpaid reservations; recover late refunds |
| `resumeOps`      | `*/15 * * * *`    | Resume durable payment operations and reconcile stuck withdrawals                            |
| `reconcile`      | `17 3 * * *`      | Compare ledger expectation with provider balance; flag stale held funds                      |
| `commission`     | `23 4 * * *`      | Sweep platform fees if operating recipient configured                                        |
| `payoutRun`      | `0 8 * * 4`       | Thursday 09:00 Lagos: build the week's payout run as a DRAFT for admins; never sends money    |
| `retentionPurge` | `41 2 * * *`      | Purge eligible transient PII and expire denylist records                                     |
| `auditVerify`    | `47 2 * * *`      | Verify the hash chain and log any break                                                      |

`resumeOps` selects up to 100 PENDING/PROVIDER_OK operations older than five minutes, ordered by update time/ID, and also reconstructs relevant older approval intents. Completion is not guaranteed within one tick. Monitor backlog age as well as counts. The old `transferRetry` schedule is superseded; inspect existing repeat jobs during upgrades because registering new names alone does not prove old schedules were removed.

## Checkout charged, missing booking confirmation

1. Obtain the original order ID/reference and inspect the owner's checkout response. The status endpoint can reconcile provider evidence.
2. Check the durable checkout state, order, associated bookings, charge evidence, and webhook/recovery logs.
3. If `READY`, resume the saved URL only through the existing checkout flow. If `INITIALIZING` or `REVIEW`, retain the reservation while provider evidence is uncertain; do not create another order or change its reference.
4. Let authenticated charge callbacks or verified recovery record the outcome. Confirm amount, currency, and reference match the intended order.
5. If a previously expired checkout later succeeds, expect `REFUND_PENDING` and refund recovery, not newly confirmed staff. Verify the final refund record before reporting a completed refund.

The 30-minute expiry is not permission to assume failure. Provider timeout, missing URL, browser dismissal, or missing callback is not conclusive unpaid evidence.

## Withdrawal pending or apparently duplicated

1. Retain the original user, request key, amount, bank-account ID, withdrawal ID, and provider reference. Ask the client to recover the original request, not generate a new key.
2. Inspect withdrawal and payment-operation state plus authoritative provider transfer status. The wallet was debited before dispatch; a pending state can therefore have a lower available balance legitimately.
3. Allow `resumeOps`/verified callbacks to settle the original operation. A timeout must not trigger a compensating credit.
4. For authoritative failure/reversal, verify a single wallet reversal and terminal FAILED state. A late success callback must not overwrite a confirmed reversal.
5. Only a new, intentional withdrawal after a confirmed failed outcome should use a fresh logical request key.

Never set `availableBalance` manually or insert a ledger row outside the ledger service. A screenshot of a client receipt is not sufficient provider evidence.

## Weekly payout run (Thursday)

Policy: [23 October decisions](../documentation/payments/weekly-payouts-decisions-2026-10-23.md). Mechanics: [Payments](PAYMENTS.md#weekly-payout-runs).

1. At 09:00 Lagos the worker builds the run as a DRAFT. If it reports `RUN_IN_PROGRESS`, an earlier run is still awaiting approval or execution: finish or reject it, then build again with `POST /api/admin/payout-runs/build`.
2. **Reviewer (admin A).** Open the run. Check the total against the expected week, look at every `NEW_PAYOUT_ACCOUNT` and `FIRST_PAYOUT` flag, and confirm each exclusion reason. If balances changed since 09:00, rebuild (refresh) before submitting. Submit.
3. **Approver (admin B, not A).** Re-read the same list and approve. Approval creates one withdrawal per line (wallets are debited now) and starts the transfers.
4. **Transfer codes (while Paystack transfer OTP is on).** Paystack sends the account owner one code per transfer. Enter each code on its line. A refused code returns `OTP_REJECTED`; request a new one with "resend". `OTP_NOT_REQUIRED` with "has not reached Paystack yet" means dispatch has not run for that line: use "send again" (`/dispatch`), then enter the code.
5. Lines settle by webhook: PAID, or FAILED with the money back in the wallet for next week. Skipped lines (suspended, account changed, balance lower than approved) keep their balance.
6. A run approved but stuck before EXECUTED is resumed by `resumeOps`. Never create a manual withdrawal or ledger row to "help" a run along.

Do not switch `PAYOUT_MODE` to `weekly` until the first run has been approved, and only after pre-launch TEST balances and recipient codes have been cleared ([production switch record](../documentation/deployment-production-mode-2026-10-23.md)).

## Refund remains pending

Inspect the durable operation, dispatch attempt, original charge reference, intended amount, and provider refund evidence. Refund retries have a stricter boundary than transfers: once a POST may have happened, recovery performs read-only verification. Missing results after an ambiguous dispatch do **not** authorize another refund POST.

A crash after persisting the attempt but before making the call can still require operator/provider investigation. Capture the evidence and involve the payment owner/provider; do not clear the attempt marker, delete the operation, or issue a manual duplicate refund to force progress. If provider success is stored as `PROVIDER_OK`, allow the recorder to commit ledger effects exactly once.

## Reconciliation alarm

The expected balance is:

```text
sum(HOLD) + sum(REFUND) + sum(COMMISSION_SWEEP) - sum(PAID withdrawals)
```

Refunds and ordinary sweeps are negative signed ledger entries. Returned sweeps have a compensating positive entry. RELEASE/FEE move value within the provider balance and are excluded. `driftKobo = actual - expected`; `ok` requires zero drift **and** no stale held booking IDs. Default stale threshold is 80 days.

On `RECONCILIATION ALARM`:

1. Preserve the result, timestamp, provider balance, and affected booking references. The job also emits `recon:alarm` to admins; this is best-effort delivery.
2. Compare recent provider transactions to durable operations, withdrawals, refunds, and sweeps. Check unrecorded provider success, reversals, and legitimate in-flight settlement timing.
3. Inspect stale holds independently of numerical drift. Confirm event/dispute/booking state and review the intended resolution with operations.
4. Escalate unexplained drift to the payment owner. If ongoing activity could compound a confirmed financial incident, use the deployment's incident controls to limit affected processing; the repository does not provide a universal payments kill switch.
5. Resolve through reviewed application operations, re-run/review reconciliation, and retain evidence. Do not insert balancing entries merely to make the alarm disappear.

The balance formula describes this implementation's operating model; provider fees, unrelated account activity, or merchant configuration require explicit investigation rather than assuming the entire account balance belongs to these ledgers.

## Worker or Redis unavailable

Check worker process status, credentials/network access, selected Redis database, queue name, job failures, and API/worker environment consistency. Restore connectivity and inspect backlog before manually retrying work. Keep original durable operations; a queue retry must not invent a new payment identity.

Redis failure affects limiting, scheduled work, and convenience signals. Current realtime delivery has no local bypass/replay buffer when configured Redis is unavailable. Refetch authoritative state through HTTP after recovery. Roll out API and worker together when changing transport versions.

## Audit-chain alarm

`AUDIT CHAIN BROKEN` is logged by `auditVerify`; the job does not establish an external paging integration. Preserve logs and the affected sequence, use read-only investigation of the chain and deployment history, and involve the security/operations owner. Do not rewrite historical hashes or reset the head pointer to silence the alarm. Distinguish tolerated legacy pre-chain rows from an actual chain break.

## Admin queues and support

Use verification, dispute, approval, ledger, user, and reward screens with an existing admin account. Actions above ₦50,000 require a separate checker. An APPROVED record may await provider execution; EXECUTED is the completed action state. Do not bypass maker-checker by directly editing the database.

The pending verification counter includes personal and business checks. In Verifications, switch to Business verifications for registry and representative-authority review. A verified registry match is not approval to act for the business: inspect the representative's verified identity and authority document before confirming. Unavailable results remain gated; refresh the original job, or reject with an actionable reason after resolving provider setup. Never grant trust by changing an account label. See [Smile ID](SMILE-ID.md#mandatory-clients-and-business-verification) for release/activation and evidence-retention limits.

Late client cancellation can be unsupported even though the policy computes an intended split. Post-payout disputes are blocked pending clawback support. Capture the case for product/payment operations and follow an approved resolution process; the existing API does not implement arbitrary split settlement.

## Retention, backup, and restore

Review daily purge/audit results. Storage deletions are best effort, and tombstoned database references do not prove object deletion; investigate storage failures and orphan cleanup separately. Do not purge financial/audit records as part of a customer erasure request.

Maintain provider/database backups and conduct restore drills in an isolated environment. After a restore, verify migrations, audit integrity, ledger/wallet consistency, and provider outcomes that occurred after the restore point before enabling workers or accepting money. This repository does not install a backup schedule or guarantee an RPO/RTO.

## Close an incident

Record root cause, impacted interval/entities, reconciled provider and ledger outcomes, recovery commands, reviewer/owner, and regression tests or follow-up work. Remove sensitive values from shareable evidence. Update the relevant guide if the response exposed a missing procedure.

## Marketplace reports and presentation preferences

Use **Marketplace reports** to filter the private queue, read a concern, and record an investigation or resolution. A stale review is rejected; reload the record before submitting another decision. Report review does not freeze escrow, cancel bookings or suspend users. Use the existing dispute/account workflows when those actions are warranted. Avoid putting unnecessary identity or payment details into review notes.

The same page allows physical preferences to be disabled per event category. Enter the category's exact spelling (case is normalized). This blocks new/edited preferences; it does not retroactively rewrite existing jobs. Review existing listings individually. One report is retained per reporter/target, so repeated submissions return the original receipt.

Roll out the marketplace migration before the API/admin/mobile changes. Updated mobile code is required for the new screens and `hirequick://jobs/` route. Local export/test evidence does not constitute a deployed native release.
