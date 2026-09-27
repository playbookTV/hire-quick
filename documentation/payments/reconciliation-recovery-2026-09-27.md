# Financial reconciliation recovery — 27 September 2026

OVA-177 remains open. The balance difference has an evidence-backed cash bridge, and a transfer-status defect is fixed. The dedicated-account / provider-account accounting contract remains a launch blocker; this work does not declare the shared account reconciled or suppress its alarm.

## Confirmed defect and correction

Paystack reports the certification commission transfer as `abandoned`, a conclusive outcome when the OTP expires. The adapter previously threw on verification of that status and left the operation pending. It now maps `abandoned`, `blocked`, and `rejected` to failure in both transfer initiation and verification, alongside the existing `failed` and `reversed` outcomes. Unrecognized outcomes continue to preserve uncertainty.

The existing durable protocol returns withdrawal reservations exactly once on confirmed failure. Failed commission sweeps append no payout entry. Six adapter cases failed before the correction; twelve new adapter/recovery cases protect these outcomes and replay behavior. See [Paystack's transfer lifecycle](https://paystack.com/docs/transfers/how-transfers-work/).

## Provider cash bridge (integer NGN kobo, TEST account)

Fresh provider reads show 2,215,000 kobo. The twelve returned balance-ledger entries form a continuous chain:

| Movement | Change | Resulting balance |
| --- | ---: | ---: |
| Opening balance implied by first returned entry | — | 12,710,000 |
| Seven September 20 refunds | -12,500,000 | 210,000 |
| September 21 test withdrawal outside the current public ledger | -10,000 | 200,000 |
| September 24 public-app charge | +2,000,000 | 2,200,000 |
| Separate certification charge | +200,000 | 2,400,000 |
| Certification refund | -100,000 | 2,300,000 |
| Certification withdrawal | -85,000 | 2,215,000 |

The certification commission transfer was abandoned; it has no balance debit. Its unswept 15,000 kobo remains in the account. Public database aggregates independently show HOLD 14,500,000, REFUND -12,500,000, and no withdrawals: expected public balance 2,000,000.

Thus the observed 215,000 excess comprises 200,000 outside the public application ledger plus 15,000 certification commission. Three successful provider transactions dated 2023/2025 total 210,000 and corroborate older account activity; the transaction list reports 17 total but returned 14, so historical transaction completeness and ownership of every opening fund are not claimed. This is an incident cash bridge, not a substitute for an account-level ledger or a verified opening-balance contract.

## Deployment and recovery

The release snapshot is `/private/tmp/hq-transfer-terminal-20260927`, based on `/private/tmp/hq-smile-monitoring-callback-20260927`. Before preparing it, 240 source/schema/build files matched both running services exactly. The only production-code change is the transfer-status mapping. The already-applied audit protection migration is included so the release retains deployed migration history. The unreleased fee migration and other workspace changes are excluded.

Both deployments succeeded: API `8e5c1ba7-a13d-49ec-b45b-ba15e5177580`, worker `a574ca4a-668c-4879-8d00-8502f63e31da`. Running source hashes match the release; public health and readiness return 200.

At 22:08 UTC, the existing durable protocol recovered the certification operations after verifying isolation on eight distinct database connections. A strict provider wrapper allowed only GET calls for the known charge, refund and transfer, with exact reference/amount/currency/TEST-domain checks. The processed refund is RECORDED, and the abandoned sweep is FAILED. One -100,000 REFUND entry was appended; the four existing ledger rows and withdrawal were preserved. A second recovery pass produced the same terminal results without further provider calls or ledger entries. There were zero outgoing provider writes and zero remaining pending certification operations.

Post-recovery public payment snapshots are unchanged. Certification expected balance is now 15,000, consistent with its unswept commission. The public expected balance remains 2,000,000. The incident remains open pending dedicated-account/account-level accounting and a clean operational reconciliation run.

A final read-only run against the deployed reconciler at 22:11 UTC confirms expected 2,000,000, actual 2,215,000, drift 215,000; classification remains `drift`, with stable snapshots and zero pending/quarantined operations. See [final reconciliation evidence](../validation-evidence/2026-09-27/reconciliation/final-readonly-reconciliation.json).

Evidence: [deployment verification](../validation-evidence/2026-09-27/reconciliation/deployment-verification.json), [GET-only recovery and replay checks](../validation-evidence/2026-09-27/reconciliation/certification-recovery.json), [post-recovery aggregates](../validation-evidence/2026-09-27/reconciliation/post-recovery.json).

## Validation

- Exact isolated release: 108 payment, provider-contract, recovery and reconciliation tests passed. API build, lint, test typecheck, tracked migrations and migration drift passed. Disposable schema removed.
- Workspace focused tests: 89 passed. Provider lifecycle scenarios: 50 passed. Workspace and test typechecks/lint passed (existing warnings remain).
- Broad workspace API run: 947 passed, five failed, one skipped. Failures involved HTTP responses/socket behavior in recruitment, checkout recovery, chat media and verification. All 53 tests in those four suites passed in a fresh isolated rerun. The intermittent broad-suite failure is unresolved; this report does not claim a clean complete run.

Evidence: [release manifest](../validation-evidence/2026-09-27/reconciliation/release-manifest.json), [provider movements](../validation-evidence/2026-09-27/reconciliation/provider-cash-bridge.json), [validation](../validation-evidence/2026-09-27/reconciliation/validation.json). Raw operation snapshots are retained privately outside the repository; credentials and beneficiary details are excluded from committed evidence.

## Linear update

Following explicit user approval, the deployment, recovery and test summary was posted to OVA-177 at 22:13 UTC (comment `457f333b-17eb-4b2f-a6f7-1436359a7d40`). The incident remains In Progress, with the dedicated-account / account-level reconciliation contract and broad-suite stability caveat recorded.
