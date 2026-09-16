# Todo orchestration — 12 September 2026

Coordinator: root. Three implementation workers report plans, checkpoints and regression evidence to the coordinator. Shared workspace edits from earlier work are preserved. Only the coordinator runs serial database validation, using disposable schemas.

## Completed implementation batches

All 15 selected tickets are now **In Review** in Linear. Final project readback returned 103 issues without another page and confirmed **43 remain Todo**. Changes are local and have not been merged or deployed. The [validation record](todo-validation-2026-09-12.md) records 311 distinct passing targeted checks and their limits.

| Ticket | Owner | Work | State |
| --- | --- | --- | --- |
| OVA-130 | provider_adapter | Authenticated KYC callbacks and active-session decisions | In Review |
| OVA-138 | validation | Atomic server refresh rotation | In Review |
| OVA-139 | withdrawal_flow | Mobile session isolation and offline recovery | In Review |
| OVA-161 | root | Dedicated no-emit test typechecks and test lint in CI | In Review |
| OVA-152 | validation | Correct Redis TLS/auth/database connections | In Review |
| OVA-156 | root | Explicit push consent and concurrent registration/withdrawal | In Review |
| OVA-159 | provider_adapter | Test-only code echoes and bounded transport recording | In Review |
| OVA-163 | withdrawal_flow; validation reviewed/fixed | Admin refresh/logout and safe checker-request recovery | In Review |
| OVA-173 / OVA-157 | provider_adapter | Keyed verifiers, expiry, atomic auth/attendance consumption | In Review |
| OVA-145 | validation | Audit-chain origin and durable terminal anchor | In Review |
| OVA-141 / OVA-155 | root; withdrawal_flow reviewed | Locked merged event edits and sparse preferences | In Review |
| OVA-154 / OVA-147 | root; withdrawal_flow reviewed | Complete selection validation and bound checkout retries | In Review |

Next batches follow dependencies and file ownership: remaining auth/consent; booking validation and privacy; worker reliability; finance invariants and recovery; then broader feature work. Each ticket advances only after its acceptance criteria are reviewed and relevant checks pass. External provider acceptance, policy decisions, business operations and publishing remain separately tracked; implementation alone does not complete those criteria.

## Evidence limits

Final database run: all 35 cases passed in `/private/tmp/hq_validation_20260912035410_5f67c6cd.log` (15 OTP/attendance, 11 checkout/event, 3 booking lifecycle and 6 auth/RBAC). Isolation, tracked migrations, drift and schema cleanup passed. The earlier client-passive lifecycle timeout passed in 21.7 seconds after adding bounded request diagnostics. Across overlapping runs, 79 distinct database cases passed; this is targeted regression evidence, not a fresh full-suite run.

Final workspace typechecks and lint passed all 14 forced tasks. Dedicated test lint and strict test typechecks passed, including the final mobile compatibility correction. CI has not run remotely.

Corrective database run: all 25 cases passed in `/private/tmp/hq_validation_20260912033636_e85b4d50.log` (8 refresh race/rollback, 6 auth/RBAC, 5 consent, 4 existing remediation and 2 notification tests). Isolation, migrations, drift and cleanup passed. The logout insertion race is fixed; the prior existing auth socket hang-up did not recur.

OVA-152: 19 parser/security units and one real disposable Redis 8.4 TLS integration passed. Real BullMQ Queue/Worker completed a job in DB5; DB0 stayed untouched. Incorrect credentials and untrusted certificates were rejected with TLS verification enabled. Local process and temporary directory cleanup verified.

OVA-159: 11 environment/transport tests passed; only isolated test mode exposes login codes or records bounded intent. Tests cannot call real notification providers even if credentials are present. Other runtimes report unavailable OTP transport instead of claiming delivery.

OVA-163: independent review reproduced restoration of old saved credentials after failed replacement login. Corrected by persisting a tombstone before dispatch and retaining pending persistence on storage failure. All 22 admin lifecycle/approval tests passed; admin build/typecheck/lint passed. Browser interaction remains unverified.

Checkout retry scope: bound keys preserve local order and reference identity; OVA-135 still owns provider-aware hosted-checkout URL recovery. Existing owner legacy keys without a verifiable request fingerprint fail closed and direct the caller to the existing order. No actual provider checkout recovery is claimed.

Deployment requirement for OVA-173: configure the managed `OTP_VERIFIER_SECRET` on every staging/production API replica before deploying. See `documentation/otp-verifiers.md` for rotation and legacy-code reissue. Attendance and login codes now have a ten-minute lifetime; no schema migration is required.

OVA-130: 25 adapter units and all 10 isolated KYC DB cases passed; source review and type/lint checks passed. Manual/admin/session changes serialize on the usher row. Actual provider flow/account acceptance remains unverified.

OVA-139: 21 pure mobile auth race/failure tests, mobile typecheck, test typecheck and focused lint passed. Coordinator review found React Native's installed AbortSignal polyfill lacks `throwIfAborted`; a portable `aborted` check now covers startup, login and HTTP dispatch. Three additional regressions exercise compatible signals without modern DOM helpers. Native-device QA remains pending. Role restoration uses the existing profile-completion route.

First security DB run: 25 passed / 2 failed across 27 tests in `/private/tmp/hq_validation_20260912033249_77ea8a94.log`; schema cleanup verified. The refresh/logout regression exposed Prisma's empty-update upsert race (P2002); coordinator replaced logout revocation with native conflict-ignoring insertion and expanded concurrent logout coverage. One existing auth/RBAC case returned a socket hang-up. Both passed in the corrective run recorded above; all 10 KYC and 3 compliance cases also passed.

OVA-161: `pnpm typecheck:tests` and `pnpm lint:tests` passed. Compiler file-list inspection included 29 API test/support sources and 4 shared test sources at the snapshot. Temporary deliberate type-error/unawaited-promise probes were rejected by their respective checks and removed. Runtime regressions: 68 provider-contract tests and 2 admin dispute tests passed. Database log: `/private/tmp/hq_validation_20260912032739_b37f1e68.log`; eight-connection schema isolation, tracked migrations, drift and cleanup passed. Production build projects were not changed. CI has not been pushed/run remotely.

Codebase graph tools were unavailable at session start. Verify-tier source fallback is used; graph project generation and index coverage are unknown. Native-device behavior and deployed provider contracts require their own evidence. The previously proposed actual TEST financial transfer remains unexecuted pending explicit authorization; it is not part of this batch.

## Starting Todo queue

58 issues returned by Linear, with no further page. Status below is a starting snapshot, not a claim of current completion.

- OVA-114: Run the full ledger suite against the HTTP adapter
- OVA-147: Bind idempotency keys to caller and request fingerprint
- OVA-100: Give dispute checkers decision evidence and reliable settlement outcomes
- OVA-167: Approve privacy notice, retention rules and unresolved-case holds
- OVA-166: Record Paystack funding-model, refund-fee and account-contract decisions
- OVA-162: Preserve fresh messages and unresolved-dispute evidence during retention
- OVA-164: Connect mobile push and realtime with consent-aware session lifecycle
- OVA-158: Refresh KYC status and recover missed provider results
- OVA-150: Launch native Dojah verification with resumable, atomically counted sessions
- OVA-137: Implement late-cancellation split settlement
- OVA-152: Preserve TLS, database and encoded credentials in worker Redis connections
- OVA-130: Require authenticated KYC callbacks and reject stale verification results
- OVA-149: Reject foreign chat-media keys before storage deletion
- OVA-159: Disable login-code echoes and unbounded notification recording in staging
- OVA-161: Typecheck and lint API/shared test sources in CI
- OVA-96: Reconciliation alarm → ops alerting + runbook
- OVA-168: Refresh dependency audit and remediate affected tooling with regression evidence
- OVA-154: Reject partially invalid applicant batches before creating checkout
- OVA-141: Validate merged event edits under the confirmation lock
- OVA-148: Recheck booking eligibility and maintain event staffing lifecycle
- OVA-144: Enforce live socket authorization and shared message validation
- OVA-135: Resume abandoned checkout and expire unpaid staffing reservations safely
- OVA-156: Preserve withdrawn push consent during device registration
- OVA-139: Make mobile logout, offline startup and token refresh session-safe
- OVA-101: EAS production build + Play / TestFlight submission
- OVA-151: Finish fair payment recovery scheduling and blocked-operation triage
- OVA-97: Verify commission sweep scheduling in worker
- OVA-160: Bound provider calls and isolate, retry and drain scheduled jobs
- OVA-89: NDPR: consent management, venue masking, privacy policy
- OVA-91: KYC verification via Dojah + user state; retire "escrow" terminology
- OVA-175: Enforce HOLD allocation conservation and accumulated integer balance limits
- OVA-174: Finalize uploads with ownership, content bounds and safe object-reference cleanup
- OVA-173: Use keyed, subject-bound OTP verifiers instead of plain SHA-256
- OVA-172: Paginate list APIs and synchronize chat incrementally
- OVA-99: Perf: migrate usher home / jobs / calendar / wallet to FlashList
- OVA-171: Remove composition-root error imports and consistently inject service dependencies
- OVA-98: Observability: Sentry + structured log shipping
- OVA-170: Persist business notifications and audit delivery with retryable outbox records
- OVA-169: Reconcile architecture and implementation documentation with current code
- OVA-122: Run all candidates through Dojah KYC
- OVA-165: Validate identity and notification providers and record identifier-retention decision
- OVA-163: Renew admin sessions and return expired sessions to login
- OVA-157: Commit attendance-code consumption with check-in and enforce attempts
- OVA-155: Preserve unmentioned nested event preferences during PATCH
- OVA-153: Make invitation decline and application eligibility consistent
- OVA-146: Persist retryable storage deletion intents and complete erasure inventory
- OVA-145: Verify audit-chain origin and durable head to detect truncation
- OVA-142: Align cancellation time boundaries and refund-fee copy across clients
- OVA-140: Mask precise venues in invitations and unpaid booking responses
- OVA-138: Consume refresh tokens atomically under concurrent reuse
- OVA-136: Resolve the 72-hour dispute window versus early wallet release
- OVA-115: Confirm no live keys reach the repo or CI logs
- OVA-127: Prepare staging environment with seeded non-PII data
- OVA-126: Scope engagement + select vendor
- OVA-125: Populate availability for launch weekend
- OVA-124: Capture and validate payout bank details
- OVA-123: Portfolio photos + profile completeness pass
- OVA-121: Recruit 50 candidate ushers via Lagos WhatsApp/Instagram channels
