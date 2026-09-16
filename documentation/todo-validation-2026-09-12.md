# Todo batch validation — 12 September 2026

This batch implements and reviews 15 tickets from the starting 58-ticket Todo queue. Work remains local pending review/merge; implementation is not deployment or provider certification. The root orchestrator assigns ownership, reviews designs and corrections, runs all serial database checks, and controls Linear updates. Three workers report plans, checkpoints, independent reviews and test evidence. Existing shared-workspace changes were preserved.

Final local validation records **311 distinct passing tests**: **199 API unit/contract**, **79 DB**, **32 shared**, and **one actual local TLS Redis integration**. Database results combine initial and corrective runs; no clean full-suite invocation is claimed. All 15 selected tickets are In Review after final Linear readback; 43 remain Todo. The earlier lifecycle timeout and the final mobile compatibility issue are corrected and covered by passing reruns.

## Ticket and review scope

| Tickets           | Implementation and review                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OVA-130           | Authenticated KYC callbacks and active-session checks; provider worker implementation and root review                                     |
| OVA-138           | Atomic refresh consumption, transactional signing/audit, token-scoped reuse policy; validation worker implementation and root race review |
| OVA-139           | Mobile session isolation, refresh and offline recovery; mobile worker and root review                                                     |
| OVA-161           | CI test typecheck/lint gates, including deliberate failing probes; root                                                                   |
| OVA-152           | Redis URL TLS, decoded credentials and database preservation; validation worker and root review                                           |
| OVA-156           | Explicit push consent under concurrent device registration; root                                                                          |
| OVA-159           | Test-only OTP echoes and bounded notification recording; provider worker and root review                                                  |
| OVA-163           | Admin rotation/logout and checker recovery; mobile worker, independent validation review and targeted correction                          |
| OVA-173 / OVA-157 | Keyed, subject-bound OTP verification and atomic attendance consumption; provider worker and root review                                  |
| OVA-145           | Audit origin and durable-head verification in a consistent snapshot; validation worker and root review                                    |
| OVA-141 / OVA-155 | Locked merged event validation and sparse preference updates; root, independently reviewed by mobile worker                               |
| OVA-154 / OVA-147 | Complete applicant selection and caller/payload-bound checkout retry; root, independently reviewed by mobile worker                       |

Final orchestrator readback returned all 103 project issues with no next page: all 15 selected tickets are In Review, and 43 remain Todo. In Review records implemented/reviewed local work awaiting merge and the stated acceptance limits; no ticket is represented as deployed. See [orchestration record](todo-orchestration-2026-09-12.md).

## Database evidence

Every run used the isolated validation runner with a unique `hq_validation_*` schema, direct connection, matching URL schema/startup search path, and eight simultaneous connections checked before writes. Tracked migrations and schema drift checks passed. Each completed run below explicitly confirms removal of its generated schema. No ordinary tests ran against an unisolated configured database.

| Log under `/private/tmp/`                   | Result and interpretation                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hq_validation_20260912032739_b37f1e68.log` | 2/2 admin dispute and maker-checker cases passed; cleanup confirmed                                                                                                                                                      |
| `hq_validation_20260912033249_77ea8a94.log` | 25 passed, 2 failed across 27: logout/rotation produced a P2002 race; existing auth/RBAC returned socket hang-up. All 10 KYC and 3 compliance cases passed; cleanup confirmed                                            |
| `hq_validation_20260912033636_e85b4d50.log` | Corrective run: 25/25 passed — refresh 8, auth 6, consent 5, remediation 4, notification 2; cleanup confirmed                                                                                                            |
| `hq_validation_20260912034713_22b0a954.log` | 25 passed, 1 failed across 26: checkout 10, audit 10, compliance 3 and two lifecycle cases passed. Client-passive auto-completion exceeded 120 seconds; corrected by the final diagnostic rerun below. Cleanup confirmed |
| `hq_validation_20260912035410_5f67c6cd.log` | Final run: 35/35 passed — OTP 15, checkout 11, lifecycle 3, auth 6; cleanup confirmed. Prior D1 lifecycle case passed in 21,713 ms with per-request diagnostic timeouts                                                  |

These invocations overlap. Their latest per-file union is **79 DB cases**: admin 2, KYC 10, refresh 8, auth 6, compliance 3, remediation 4, consent 5, notifications 2, checkout 11, audit 10, lifecycle 3 and OTP 15. The final 35-case run completed in 259.79 seconds. Do not sum repeated run totals. The runner injects its own isolated OTP verifier key rather than inheriting the configured key.

## Unit, integration and static checks

| Distinct unit suite                 | Latest passing cases |
| ----------------------------------- | -------------------: |
| Mobile session                      |                   21 |
| Admin session and approval controls |                   22 |
| Notification environment/transport  |                   11 |
| KYC adapter                         |                   25 |
| Redis URL/security parser           |                   19 |
| Refresh JWT validation              |                   10 |
| OTP environment                     |                    8 |
| OTP keyed verifier                  |                   15 |
| Provider HTTP contract              |                   68 |
| **API unit/contract union**         |              **199** |

The first root unit run had 101 passes; the corrective 56-case run replaced admin's earlier 18 with 22, added 23 OTP cases, and repeated the same 11 transport cases. The final React Native compatibility correction increased mobile coverage from 18 to 21. Those overlaps are counted once. The additional 68 cases are `apps/api/src/modules/payments/port/__tests__/http-paystack-contract.test.ts` (root run at 04:26:03, 228 ms), with no overlap against those groups. Root freshly reran all 32 shared cases across four files; they count separately from API tests.

The actual local Redis integration passed separately: disposable authenticated TLS Redis 8.4, real BullMQ Queue/Worker completion in DB5, no queue keys in DB0, rejection of invalid credentials and an untrusted certificate. The generated CA was explicitly trusted; TLS verification stayed enabled. Only the test process and temporary files were removed, with cleanup verified. This is not a deployed Redis certification.

`/private/tmp/hq-todo-workspace-static.log` records 14/14 forced workspace tasks passed, with no cache hits. `/private/tmp/hq-todo-test-lint-final.log` records test lint success. OVA-161's deliberately invalid type and unawaited-promise probes were rejected and removed. The final admin correction separately passed all 22 unit cases, API test typecheck, root test lint, admin production build and full admin lint. Those 14 forced tasks ran after the OTP/checkout source edits. Subsequent lifecycle diagnostic-timeout and owner-legacy test edits passed test typecheck/lint. The final mobile correction passed its 21-case suite, mixed strict test typecheck, mobile typecheck and focused production lint; the final root test lint invocation also passed. Root whole-workspace `git diff --check` passed.

## Corrections and limits

- The refresh/logout regression exposed Prisma empty-update upsert's unique-key race. Root changed idempotent logout to conflict-ignoring insertion; all eight refresh regressions then passed. The separate auth socket failure did not recur in the corrective six-case run.
- The earlier client-passive lifecycle case exceeded 120 seconds. Root added bounded per-request diagnostics; the unchanged business outcome passed on the final run in 21.7 seconds. No persistent failure is established by that timeout.
- Root found that the installed React Native AbortController exposes `aborted` without `throwIfAborted`. The mobile worker replaced those calls with portable abort checks and added three regressions using a test controller matching the installed React Native signal surface. All 21 mobile cases passed, including already-aborted dispatch and canceled refresh restoration.
- Independent admin review reproduced old saved credentials returning after a failed replacement login. The correction durably clears the old pair before OTP dispatch, retains a pending clear on storage failure, and revokes captured refresh credentials best-effort. Invalid OTP, network failure, non-admin replacement and repeated storage denial are covered.
- The audit verifier detects origin, internal and tail deletion while the corresponding durable evidence remains. Same-database head storage is not independent protection against an administrator rewriting both history and head; external signed/WORM checkpoints are documented but unimplemented.
- Production rollout requires a managed `OTP_VERIFIER_SECRET` on every replica before deployment. Login/attendance codes expire after ten minutes; legacy-code expiry/reissue and key rotation are documented in [OTP verifier guidance](otp-verifiers.md).
- Hosted-checkout URL recovery remains OVA-135 scope. Bound local checkout identity does not establish actual provider recovery or settlement.
- Native-device QA, browser interaction, actual KYC/notification provider acceptance, and financial-provider certification were not performed. The earlier proposed actual TEST transfer remains unexecuted pending explicit authorization; it is not part of these counts.
- Graph MCP tools were unavailable. Evidence uses Verify-tier exact source reads/searches; graph generation and index coverage are unknown. These targeted runs are not a new full payment regression run or a remote CI/deployment result.
