# Reconciliation and payment recovery

Tracks OVA-96 and OVA-151. This runbook describes the implementation, not a completed staging drill. Account-contract decisions are recorded separately in [Paystack account decisions](paystack-account-decisions.md).

## Ownership and activation

The incident lead is the on-call Operations owner; Finance owns balance explanations and the backend on-call owns recovery. Named people, their contact channel and the paging destination must be assigned before launch. No on-call assignment or alert subscription is claimed by this document.

The deployed worker needs `REDIS_URL`, the same database and Paystack account as the API, and the committed payment-recovery migration. Worker readiness is the `scheduled jobs ready` log. Each workload has its own queue; reconciliation runs on the UTC schedule defined in `apps/api/src/modules/jobs/runtime.ts`.

Configure the log monitor to page on `RECONCILIATION ALARM`, reconciliation queue failures and missing scheduled runs. The application emits an admin `recon:alarm` signal, but this is best-effort and is not an offline paging service. The admin Payment operations page loads durable reconciliation history; operators must refresh it for current results. Collection failures also emit a sanitized alarm and fail the job for retry. A database outage can prevent an audit row, so worker-health monitoring is required independently.

## Triage

1. Record the run ID, UTC observation time and environment. Open **Payment operations → Reconciliation history** and inspect the recorded evidence. An error without a saved run requires investigation of worker logs and provider/database availability.
2. Mark the run **investigating**, with at least ten characters of evidence. The review is an appended audit entry. Do not place keys, full bank details or raw provider responses in review notes.
3. Compare `before` and `after` database snapshots, provider-read timestamps, expected/actual integer-kobo balances, pending/quarantined operations and aged held/frozen bookings. The stale cutoff defaults to 80 days; that is an application threshold, not proof of an approved provider holding limit.
4. `in_flight` means the database changed across the provider read or unresolved operations/processing withdrawals exist. Obtain another sample after settlement; it is not a clean reconciliation and does not establish that the entire difference is transient. Escalate persistent differences even if one blocked operation keeps the classification in-flight.
5. `drift` means a stable sample differs by at least one kobo. Compare provider transaction/transfer/refund evidence, funding, processing and transfer charges, reversals and payout timing. Never manufacture a balancing ledger entry or overwrite a wallet balance to silence an alarm.
6. `review` with zero drift still requires review of aged held/frozen funds. Investigate disputes and release/refund prerequisites; age alone does not authorize a transfer or refund.
7. Record **explained** only with a matched external reference, amount and reason. Record **resolved** only after the underlying issue is addressed and a later balance sample supports resolution. Marking a review does not execute a money operation or change the underlying run.

## Containing outgoing payments

There is no global payout-pause switch in the current application. Quarantine pauses automatic recovery of one operation; it does not stop a fresh withdrawal or an already-issued provider transfer.

For a payout incident, the deployment owner must temporarily reject new withdrawal POSTs (`/api/payments/withdrawals`) at the ingress, and drain/stop the scheduled worker replicas that can dispatch recovery and commission transfers. Confirm every replica is stopped, including the legacy queue consumer. Requests already in progress may already have reached Paystack; track their original references and reconcile them. Keep the signed Paystack webhook endpoint available so terminal evidence can be recorded. Do not revoke credentials as a routine pause or delete queues/operations.

This containment also stops other scheduled jobs, including reconciliation. Schedule explicit balance checks and operational follow-up during the pause. Restore workers and ingress only after the incident lead and Finance agree on the evidence and any in-flight obligations. Deployment-specific ingress commands and owner contacts must be rehearsed in staging before this procedure counts as operational readiness.

## Recovery queue

**Payment operations → Unresolved payments** shows provider reference, status, last safe error, recovery attempts, next check and quarantine state. Record provider lookup evidence before choosing **Quarantine** or **Resume recovery**.

Claims use `FOR UPDATE SKIP LOCKED` and one atomic batch update, commit the lease before dispatch, and claim at most 100 eligible operations. This avoids the previous 100 serial updates exceeding the transaction deadline on a remote database. Recovery waits at least five minutes after an operation update, backs off from five minutes to six hours, and quarantines at the twelfth automatic claim. Callback settlement remains permitted. Legacy backfill/check failures are reported after scheduled operations are processed. A failed provider action or failed diagnostic write cannot stop the rest of an already claimed batch; failed diagnostic writes still fail the job after the batch so the problem remains visible.

Resume resets only recovery eligibility. It retains provider dispatch attempts and the original reference. It must not blindly repeat an uncertain refund POST. If a refund was dispatched and no conclusive match is found, preserve uncertainty and obtain provider support evidence. Operator review cannot override maker-checker rules or authorize a new financial operation.

## Balance model and limitations

Expected provider balance is the signed sum of HOLD, REFUND and COMMISSION_SWEEP entries, less PAID withdrawals. RELEASE, FEE and REVERSAL ledger types explicitly have zero direct provider-balance effect; transfer reversal settlement uses the existing withdrawal/compensation path. `PROVIDER_BALANCE_EFFECT` is exhaustive over ledger types so schema additions require an explicit decision.

The formula does not model opening account balance, top-ups, provider processing/transfer charges or settlement timing. These are unresolved account-model requirements under OVA-166, not tolerances to suppress. A Paystack balance read and a database transaction cannot share an atomic snapshot. The repeatable-read snapshots and in-flight classification expose that limitation; they do not remove it.

## Required staging drill

Use an isolated staging database/account baseline. Never insert a fake ledger row into a shared environment to manufacture drift.

- Run a controlled reconciliation dependency that reports the baseline plus one kobo. Confirm the persisted run, sanitized alarm, configured pager delivery, and an operator's acknowledgement/review. A mocked emitter test alone is not pager-delivery evidence.
- Repeat with a failed provider read and confirm retry plus the error alarm. Confirm worker-health monitoring catches database failure when no audit can be persisted.
- Seed 101 isolated unresolved operations; fail the first batch before provider work and verify operation 101 advances. Check concurrent claims, capped retry, quarantine and audited resume. No real provider POST is needed for this drill.
- Rehearse ingress containment and worker draining with callbacks available, then remove the restrictions.
- Archive run IDs, environment/version, delivery and acknowledgement times, operator identity and the later resolving sample. No completed staging delivery or containment drill is recorded yet.
