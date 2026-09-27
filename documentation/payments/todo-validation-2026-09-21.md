# Payment Todo review — 21 September 2026

Linear disposition: OVA-124, OVA-142 and OVA-151 are In Review; OVA-96, OVA-114 and OVA-166 remain In Progress for external/staging evidence; OVA-136 and OVA-137 are In Review following local implementation of both approved policies; local implementation and subsequent validation are recorded in the [settlement report](settlement-implementation-2026-09-21.md).

Scope: eight HireQuick payment issues in Linear's Todo state at the start of this pass. Existing In Progress/In Review implementation was inspected where it supports these tickets. Implementation was initially validated locally; the subsequent [21 September staging deployment](../deployment-2026-09-21.md) deployed the API, worker and admin. No workspace commit or push is claimed. The newly approved policy specifications are not implemented by that deployment. A single actual TEST transfer was explicitly authorized and completed successfully at Paystack after the owner supplied the OTP; details are below.

## Ticket disposition

| Ticket | Verified implementation / work in this pass | Remaining acceptance |
| --- | --- | --- |
| OVA-96 | Existing repeatable-read reconciliation evidence, admin history/review and aged-held/frozen checks; added sanitized alarms for collection failures and an operational runbook | Deployed one-kobo alarm delivery and operator acknowledgement, named on-call/pager, containment rehearsal, account fee/funding model |
| OVA-114 | Maintained local HTTP/InMemory lifecycle runner can now run alone; adapter/signature unit coverage rerun; TEST balance GET succeeded | Funded actual TEST checkout/refund/withdrawal/sweep lifecycle and callback/fee/limit evidence; bounded probe verified pending replay; owner OTP then completed the same provider transfer |
| OVA-124 | Existing mobile bank picker, ten-digit capture, lookup/retry and server re-resolution; added three registration tests covering name spoofing and lookup/recipient failure | Native interaction and account-specific recipient requirements remain unverified |
| OVA-136 | Approved hold implemented in shared/ledger/API/worker/admin/mobile; subsequent results in the settlement report | Final regressions and server/admin deployment passed 22 September; native acceptance and review remain |
| OVA-137 | Approved split implemented with immutable reservation, maker-checker, audit and recovery; subsequent results in the settlement report | Corrected audit recovery and server/admin deployment passed 22 September; native acceptance and separate provider certification remain |
| OVA-142 | Existing server cancellation quote and shared Lagos event conversion; verified exact 12/48-hour boundaries and disabled fee-deduction behavior | Native UX verification; approved net compensation/commission copy is now implemented with OVA-137 |
| OVA-151 | Existing committed recovery migration, SKIP LOCKED lease/backoff/quarantine and admin evidence review; fixed legacy-check and diagnostic-write failures aborting scheduled work | Staging operator workflow validation; local database fairness passed (results below) |
| OVA-166 | Added account decision register with official sources and TEST balance observation; made unapproved decisions and proposed owner roles explicit | Named accountable owners and written account-specific decisions/evidence |

Approval recorded after the validation below: [approved settlement policy](approved-settlement-policy-2026-09-21.md). The earlier passing tests do not validate the subsequently implemented settlement rules; see the separate settlement implementation report for their results.

See [reconciliation runbook](reconciliation-runbook.md) and [account decision register](paystack-account-decisions.md). No provider support message was sent and no account setting was changed.

## Validation

**220 unique focused tests passed** across the latest successful runs: 116 API unit/contract, 48 shared-domain, 18 database and 38 local lifecycle/UI-recovery tests. Earlier failures described below were corrected and passed on targeted reruns. This is not a claim that the complete monorepo test suite ran.

- 116 API unit/contract tests passed: HTTP contract 68; HTTP refund 13; signed webhook 6; payment alarms/recovery error paths 4; bank registration 3; withdrawal retry/receipt 18; durable operations 4.
- All 48 shared-domain tests passed, including millisecond cancellation boundaries at Lagos midnight and odd-kobo cancellation preview conservation.
- API/shared production and test-source typechecks passed. The root test-source typecheck/lint commands now include validation tests and passed, as did API lint, changed-test formatting and documentation links. Validation uses Bundler resolution for the mixed API/mobile imports; production module resolution is unchanged.
- The first webhook attempt was blocked by the sandbox's local HTTP-listener restriction; all six passed when rerun with local-listener permission.
- Initial isolated database attempts failed during connection startup. DNS and TCP were verified without exposing credentials. The validation-only pool wait now permits 60 seconds for cold startup.
- The subsequent isolated run connected to PostgreSQL 18.6, verified raw-SQL schema/search-path isolation on eight concurrent connections, applied all eight tracked migrations and passed the drift check. The first affected run passed 15 tests and failed two: the sequential 100-row recovery claim exceeded its transaction deadline, and a combined HOLD/freeze test fixture exceeded the default transaction deadline. The recovery implementation now uses one atomic update; the fixture has an explicit 30-second test transaction limit. The focused rerun passed all eight tests (five recovery, three reconciliation). Operation 101 progressed in 2.7 seconds. Combined latest database results: 18 unique passes across recovery, reconciliation, terminal operations and commission replay; the initial failures are superseded by the focused rerun.
- Local test modes suppress external provider credentials. The explicitly authorized TEST probe reads the verified TEST key only. Every completed database run removed its own generated schema and verified cleanup.

The first local lifecycle rerun exposed a stale fixture: it created an order without the durable CREATED checkout now required for initialization. Both transports correctly withheld a fresh provider call for that legacy/uncertain state. The fixture now creates a real new-checkout state, requires READY, records verified charge settlement through `recordCheckoutCharge`, and checks one HTTP initialization. Both lifecycle cases passed on rerun (133.4s and 113.5s), as did all 36 UI-recovery checks. Test-only remote transaction/lifecycle ceilings are explicit; production deadlines were not increased.

CI is now configured to run this isolated local HTTP lifecycle after the normal suite. The runner accepts environment-only database configuration and uses the platform temporary directory so it works on Linux CI as well as macOS. Source typechecking/lint now covers these validation tests, including proper handling of loopback server promises. The GitHub CI job itself has not been run in this session.

## Actual approved TEST transfer

The user authorized exactly one ₦100 TEST transfer to the existing TEST recipient ending 7716. Read-only lookup confirmed active NGN/TEST status, and a boolean-only check confirmed the local key matches the configured TEST-only MCP key.

The probe made one transfer POST. Paystack returned TEST-domain `otp`; bounded GET-only polling remained pending. Same-key replay returned the same PROCESSING withdrawal, with exactly one wallet debit, 7,000-kobo synthetic wallet remainder, no reversal and no second transfer POST. Provider balance delta was zero during this pending observation. The probe correctly exited incomplete rather than reporting a successful payout.

- Reference: `wd_44406204-0b51-4157-b4ee-37db96e9a74b`.
- Existing transfer code: `TRF_2jeo1mtox2z1dp9g`.
- Evidence: [sanitized probe JSON](test-withdrawal-evidence-2026-09-21.json).
- A subsequent GET independently confirmed `otp`, TEST, NGN and 10,000 kobo. The owner supplied the OTP; one finalize request completed the existing transfer. A separate GET then confirmed `success` for the same reference, TEST domain, NGN and 10,000 kobo. Balance fell from 210,000 to 200,000 kobo. No second transfer or OTP-security setting change occurred, and the OTP is not stored in evidence. See [finalization evidence](test-transfer-finalization-2026-09-21.json).
- The disposable database was cleaned up after the bounded probe, including its synthetic ledger fixture. The later provider finalization is external evidence only; it cannot be represented as terminal settlement of that deleted local fixture.

This establishes actual TEST transfer success plus earlier pending/OTP and replay behavior. It is not funded checkout-to-payout certification or a terminal local-ledger integration pass. OVA-114 remains open for the rest of its acceptance matrix.

## Database logs and cleanup

| Run | Result | Cleanup |
| --- | --- | --- |
| `/private/tmp/hq_validation_20260921190540_4456da14.log` | 15 passed, two failed; exposed the recovery timeout and fixture timeout | Schema removal verified |
| `/private/tmp/hq_validation_20260921191827_0f257769.log` | Focused rerun: all eight passed | Schema removal verified |
| `/private/tmp/hq_validation_20260921191624_1f3aeccd.log` | Approved actual TEST probe: one POST, OTP pending; later finalized externally using the owner OTP | Schema removal verified |
| `/private/tmp/hq_validation_20260921192118_4464643a.log` | Initial local lifecycle: two stale-fixture failures, 36 UI-recovery passes | Schema removal verified |
| `/private/tmp/hq_validation_20260921192518_752aad3f.log` | Corrected local HTTP/InMemory lifecycle and UI recovery: all 38 passed | Schema removal verified |

## Reproduction

Use the existing isolated runner; do not run DB-backed tests against configured URLs unchanged:

```sh
node scripts/validation/isolated-payments.mjs --run --api-test-files=src/modules/payments/__tests__/recovery-schedule.test.ts,src/modules/payments/__tests__/reconciliation-operations.test.ts,src/modules/payments/__tests__/terminal-operations.test.ts,src/modules/jobs/__tests__/commission-schedule.test.ts
node scripts/validation/isolated-payments.mjs --run --local-lifecycle-only
```

`--local-lifecycle-only` runs the local HTTP/InMemory lifecycle configuration without the complete API suite. It is not actual Paystack certification. `--static-already-passed` is valid only after running the relevant static checks for the current changes.

Graph tools were unavailable in this session. Code evidence uses direct scoped source inspection; graph generation/coverage is unknown.
