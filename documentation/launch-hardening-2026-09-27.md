# Launch hardening — 27 September 2026

The current workspace's full serial API suite passes: **933 passed, 0 failed, 1 skipped across 102 files**. The maintained runner also passed all **50 local provider-lifecycle checks**, applied tracked migrations without drift, and verified removal of its disposable schema. This is workspace evidence, not certification of the currently deployed API, worker, or mobile build.

## Regression diagnosis and changes

The historical 25 September result was 871 passed / 22 failed / 1 skipped. A fresh baseline using temporary local PostgreSQL reproduced 12 failures, with 920 passes and one skip. Remote database timeouts did not recur locally. Existing runner changes already clear external messaging credentials.

| Reproduced failure | Cause and correction |
| --- | --- |
| Six KudiSMS callback assertions | HTTP request logging adds another safe info event. Assert exactly one delivery-report event and continue checking **all** logs for sensitive payload leakage. |
| Withdrawal concurrency setup | A unit test spied on a shared Prisma proxy; restoring the spy left `bankAccount.create` unusable in later suites. Inject an owned database double into the bank-account unit tests. |
| Three dashboard authorization checks | User fixtures omitted the role now checked by authentication. Include the role and mock the database module without mutating its shared Prisma client. |
| Notification email lookup | The dashboard suite's Prisma proxy spy leaked into the later notification suite. The isolated module mock removes this interference. |
| Cancellation response assertion | The endpoint reports durable settlement status `RECORDED`. Update this assertion while retaining the independent database assertion that the booking is `REFUNDED`. |

API Vitest now executes the existing disposable-database guard in global setup **before loading any test file**, including unit files. A negative check against a local ordinary `public` database failed before test collection as intended. This closes a gap where historical suites without a per-file guard could access an application database.

A new audit regression proves that deleting a user preserves the actor reference and leaves the chain verifiable under the current migrations. A type-only import in an existing verification test was also corrected to satisfy test-source lint.

## Validation and scope

- Local environment: macOS ARM64, Node 26.8.1, pnpm 10.27.0, temporary PostgreSQL 16 on loopback port 55439. CI uses Node 22, so CI remains a separate release check.
- Runner: `scripts/validation/isolated-payments.mjs --run`, with both database URLs explicitly set to the temporary local server. Fake provider transport; no Paystack payments were initiated.
- Prisma generation, eight-connection raw SQL isolation, workspace typecheck/lint, tracked migration deployment and zero drift: passed.
- Local provider lifecycle: 50/50 passed. API: 933 passed, one skipped; 101 passing files and one skipped file.
- The skipped test is the real R2 PUT/GET/delete round-trip, because storage credentials are deliberately absent. This is not live storage acceptance.
- Test-source typecheck/lint, documentation links, and whitespace checks: passed.
- The runner removed and verified cleanup of `hq_validation_20260927200204_afd985d4`.
- HEAD is `ce1e9c2c2955537e7131012db87857628701b40a`; the working tree contains pre-existing uncommitted changes. See the [source manifest](validation-evidence/2026-09-27/launch-hardening/source-manifest.json) and [validation summary](validation-evidence/2026-09-27/launch-hardening/validation.json). Type-only import corrections were made during the full run and checked afterward; they do not change executed behavior.

## OVA-176 — audit verification remains open

A read-only, repeatable-read inspection of the deployed worker's database at 19:59 UTC found **458 audit rows, 80 entry-hash mismatches and 14 missing predecessor hashes**. All 80 mismatches have a null actor. For 51 entries, substituting the known actor in memory restores the original stored hash exactly; no database values were changed. The historical baseline migration used `ON DELETE SET NULL` for the actor, and `20260627121512_drop_audit_actor_fk` removed that relationship. The live database has no remaining audit foreign key.

This establishes lost actor references for the recoverable subset and identifies the historical foreign key as a credible mechanism. It does not prove the cause of every damaged entry. The other 29 mismatches remain unresolved. Missing predecessor hashes occur as late as an entry dated **26 September**, so this cannot be dismissed as June-only damage. The durable head still matches the tail; that does not repair earlier breaks.

The [sanitized read-only evidence](validation-evidence/2026-09-27/launch-hardening/live-readonly-diagnosis.json) contains sequence numbers, actions, timestamps and aggregate findings, without account identities. Historical test-like action names occur around some breaks, but the actor/process responsible for each missing entry has not been established.

Required recovery: preserve a restricted forensic snapshot; compare missing hashes and original actors with retained backups or exports; recover evidence into a separate reconstruction first; have the integrity treatment reviewed before any historical data change. If original records cannot be recovered, explicitly document the unrecoverable boundary and approve a separately anchored future chain. Do not rehash damaged history, remove the alarm, or report full-chain integrity as restored. The new test guard prevents this test configuration from targeting ordinary application storage; it cannot retroactively repair damage or constrain arbitrary external scripts.

## OVA-177 — financial reconciliation remains open

The recorded reconciliation runs for 25–27 September consistently report expected **2,000,000 kobo**, actual **2,215,000 kobo**, and **215,000 kobo (₦2,150) excess**. They classify this as drift, with no public-schema pending/quarantined operations, stale held/frozen bookings or snapshot changes. These are recorded run values, not a fresh provider balance request.

The separate retained TEST certification schema has a 200,000-kobo HOLD, -85,000 RELEASE and -15,000 FEE, with a refund and commission sweep still pending locally and a recorded withdrawal. Those operations are outside the public-schema reconciliation inventory despite using the same provider account. The [24 September provider certification](payments/certification-2026-09-24.md) records the provider-side refund debit and successful withdrawal, plus an OTP-pending sweep and unexplained opening funds.

The 215,000-kobo discrepancy is consistent with the earlier 200,000-kobo discrepancy plus a 15,000-kobo certification residual. This is a hypothesis supported by the recorded amounts, not a complete account reconciliation. It requires a provider statement, account/environment attribution, and final status evidence for the outstanding certification operations.

Required recovery: obtain the bounded provider statement covering the opening balance and certification window; map every movement across both schemas; resolve pending certification operations through their durable recovery flow only after provider status is known; define the account-level opening-funds/external-funding contract in OVA-166 or use a dedicated account. Then rerun reconciliation and verify alert recovery. Do not invent balancing ledger rows or automatically resend financial operations to make the alarm green.

## Remaining release gates

OVA-179 is ready for review of the workspace fixes, but exact release-snapshot/CI certification remains. OVA-176 and OVA-177 remain launch blockers. The compatible fee rollout (OVA-178), native device/Smile acceptance, provider approval/accounting decisions and broader launch acceptance are unchanged by this work. No deployment or incident resolution was performed.
