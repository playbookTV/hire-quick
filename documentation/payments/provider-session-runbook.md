# Resumable Paystack TEST validation

This tool supports OVA-114. It is not a production feature or proof of OVA-166 account permission. It refuses LIVE keys and creates a private, uniquely named `hq_validation_cert_…` PostgreSQL schema using the configured direct connection. Application/staging tables remain untouched. Do not run against an unrelated database or select a beneficiary without checking its TEST account and currency.

## Scope and bounds

The session initializes one simulated ₦2,000 checkout for two ₦1,000 bookings. After hosted TEST payment and authoritative verification, it records HOLD twice (replay check), marks synthetic historical attendance, releases one booking (₦850 wallet credit + ₦150 commission), refunds the other booking (₦1,000), withdraws ₦850 and sweeps ₦150. Withdrawal and commission use the explicitly selected TEST recipient; this does not validate a real operating-bank relationship. No bank-account creation or account-security changes are made at Paystack.

Every outgoing POST is bound to its exact endpoint, original reference, amount, currency and recipient. The dispatch reservation is saved to the private session file **before** the network call. Once reserved, another POST for the same operation is blocked even after a crash or response loss. Recovery uses the application services and provider GET evidence. This is intentionally stricter than a general-purpose provider client: ambiguous initialization/dispatch can require investigation.

The session retains its database and private state while refund or OTP/transfer evidence is pending. An exclusive local lock rejects concurrent commands. Do not remove a lock until its owning process has exited. Do not delete or edit the dispatch reservations to force another request.

## Commands

Run from the repository root. Use a new private file outside the repository and the existing TEST recipient selected after a read-only lookup:

```sh
HQ_TEST_RECIPIENT=RCP_selected_test_recipient pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts start /private/tmp/hq-provider-session.private.json
```

The returned checkout URL is for TEST mode. Complete the hosted simulator; do not enter real card details. Then run each stage separately with the **same** private session path:

```sh
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts charge /private/tmp/hq-provider-session.private.json
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts refund /private/tmp/hq-provider-session.private.json
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts withdraw /private/tmp/hq-provider-session.private.json
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts sweep /private/tmp/hq-provider-session.private.json
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts inspect /private/tmp/hq-provider-session.private.json
```

Pending provider operations produce exit code 2 for financial stages. A zero exit from `start`, `charge` or `inspect` is not certification: inspect `sessionComplete` and the recorded provider/ledger states. Failures produce exit code 1 and retain the session. A rejected initialization must not be called a completed payment; the 24 September initial attempt was verified absent and cleaned before the corrected attempt. That attempt used a `.invalid` fixture email, but the exact rejection cause was not retained.

If Paystack requires transfer OTPs, the account owner approves the **existing** TEST withdrawal and sweep through Paystack's normal process. Never disable OTP to make the test pass. Rerun `withdraw` and `sweep` afterward: they verify the same references and finish local ledger recording. Rerun `refund` for GET-only recovery of the original refund; pending/needs-attention is not processed.

## Reconciliation and cleanup

Evidence separates the opening account balance from this session's ledger principal and observed account delta. It does not insert balancing ledger entries or claim the shared Paystack account belongs exclusively to this test. Unexplained movements remain a discrepancy; provider fees, funding timing and unrelated account activity must be investigated rather than absorbed into usher payouts.

Only after all three operations are RECORDED, the withdrawal is PAID, the wallet and both bookings settle, and the account delta matches the ledger does normal cleanup drop this session's schema and verify its absence:

```sh
pnpm --filter @hq/api exec tsx ../../scripts/validation/provider-session.ts cleanup /private/tmp/hq-provider-session.private.json
```

A rejected initialization with no ledger/payment-operation records can be cleaned only after Paystack independently confirms its reference is absent. Other partial setup failures require inspection and narrowly scoped manual cleanup; never drop a schema merely because the script returned an error. Archive sanitized results and source hashes before deleting private files. They must not contain keys, full bank details, OTPs or customer records.

## What this does not certify

- Native checkout/restart UX, real attendance, or admission through the deployed application.
- Provider-originated webhook delivery/signatures, delayed/out-of-order provider callbacks or all failure simulations. Locally signed callback tests must remain labelled local.
- Actual provider reversal, insufficient transfer balance, every refund status, account limits or live fees unless separately observed.
- Legal entity approval, Manual Payouts enablement, held-wallet permission, live settlement timing or production readiness. Paystack documents that TEST mode does not process settlements: [authentication and environments](https://paystack.com/docs/api/authentication/).
