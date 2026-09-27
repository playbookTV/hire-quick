# Checkout, ledger and realtime validation — 14 September 2026

**Completed 16 September 2026: 251 distinct batch tests passed; OVA-135, OVA-175 and OVA-144 are In Review.** This report covers OVA-135 (checkout recovery), OVA-175 (ledger conservation and integer limits) and OVA-144 (live socket authorization). Root coordinated implementation workers, independent review, serial disposable database execution and ticket acceptance. Linear readback confirmed all three In Review after evidence was appended.

## Current verification — 16 September 2026

| Evidence | Verified result |
| --- | --- |
| [Pure regressions](validation-evidence/2026-09-16/pure.txt) | **69/69 passed** in 0.564 s: checkout mobile 13, socket security 25, failure precedence 2, ledger amounts 12, commission limits 3 and HTTP checkout contracts 14. |
| [Parser and transport regressions](validation-evidence/2026-09-16/parser-transport.txt) | **10/10 passed**, no skips, in 1.31 s: four actual loopback HTTP parser cases and six Socket.IO cases, including disposable authenticated Redis. |
| [API production typecheck](validation-evidence/2026-09-16/api-typecheck.txt) and [strict test typecheck](validation-evidence/2026-09-16/api-test-typecheck.txt) | Both exit 0 on 16 September against the parser implementation tested here. |
| [Production lint](validation-evidence/2026-09-16/parser-production-lint.txt) and [dedicated test lint](validation-evidence/2026-09-16/parser-test-lint.txt) | Both exit 0. Tests use the root test configuration because the default production configuration excludes them. |

There are **79 distinct current non-database passes**. The transport suite uses real loopback Socket.IO and Redis with mocked authorization/message database ports. It verifies malformed and oversized traffic, reconnect quotas, guarded worker/user/booking/admin delivery, logical database isolation, Redis outages and subscriber-only failures. Its temporary process, files and connections are cleaned up. Test commands used unused loopback database URLs and blank provider/configured Redis credentials. Retained evidence was inspected for credentials and includes exact commands and exit status.

On **14 September 2026**, the first financial database run completed **29/29 cases across six files** in 716.65 s: ledger boundaries 14, ledger 6, remediation 4, withdrawal reversal 2, reconciliation 2 and concurrency 1. Eight-connection isolation, six then-current migrations and drift passed. The 14 September final forced workspace checks passed **14/14 tasks** in 83.885 s, and root test lint passed; an earlier mobile lint failure had been corrected. These completed results are historical evidence retained in the session report; their temporary logs are no longer available after restart. The earlier 75 pure/transport cases overlap the current reruns and are not counted again.

Concurrent work outside this batch is changing mobile UI, README/documentation, environment examples and root ESLint/package/CI files. Those changes are preserved and are outside this report’s acceptance. The 14-task result is historical, not a current whole-workspace pass. Current API-focused checks apply to the tested API changes; the 79 pure/transport cases ran before the unrelated UI edits. Root’s repository `git diff --check` passed on 16 September.

## Integrated database scope

The 14 September integrated run was interrupted; its partial results are not counted as a completed run. Root restarted the complete scope on **16 September**, session `82677`, temporary log `/private/tmp/hq_validation_20260916093518_197e7fc6.log`, retained as [database evidence](validation-evidence/2026-09-16/database.txt). The new run has passed eight-connection isolation, all seven migrations and migration drift. Checkout migrations were authored offline and the Prisma client generated locally.

| Test file | Cases | Initial integrated-run result |
| --- | ---: | --- |
| `payments/__tests__/operation-recovery.test.ts` | 17 | Passed |
| `events/__tests__/recruitment-lifecycle.test.ts` | 15 | Passed |
| `payments/__tests__/checkout-recovery.test.ts` | 9 | Passed |
| `events/__tests__/checkout-validation.test.ts` | 11 | Passed |
| `payments/__tests__/terminal-operations.test.ts` | 9 | 8 passed, 1 failed initially; all 9 passed after correction |
| `payments/__tests__/withdrawal-outcomes.test.ts` | 11 | Passed |
| `payments/__tests__/webhook.test.ts` | 2 | Passed |
| `bookings/__tests__/lifecycle.test.ts` | 3 | Passed |
| `privacy/__tests__/checkout-privacy.test.ts` | 5 | Passed |
| `storage/__tests__/chat-media.test.ts` | 10 | Passed |
| `auth/__tests__/auth.test.ts` | 6 | Passed |
| `auth/__tests__/refresh-rotation.test.ts` | 8 | Passed |
| `auth/__tests__/otp-consumption.test.ts` | 15 | Passed |
| `realtime/__tests__/live-authorization.test.ts` | 12 | Passed |
| `realtime/__tests__/gateway.test.ts` | 3 | Passed |
| `realtime/__tests__/chat.test.ts` | 1 | Passed |
| **Total** | **137** | **136 passed, 1 failed; completed in 2049.46 s (15 files passed, 1 failed)** |

Module paths above are relative to `apps/api/src/modules/`; realtime paths are relative to `apps/api/src/`. This table preserves the initial integrated-run outcome. Its failure was corrected and passed in subsequent runs, including the final 47-case run. This scope exercises recovery, late-charge compensation, expiry/webhook races, privacy, inbox receipts and current session/audience authorization. Authorization fixtures use CONFIRMED bookings to exercise access rules; they do not demonstrate funded settlement.

Root verified on 16 September that the completed-run schema `hq_validation_20260914171411_18a326f1` was absent. The interrupted-run schema `hq_validation_20260914173211_79d089d1` remained; after confirming no other active queries referenced it, root dropped only that owned schema and verified absence. The completed integrated-run schema `hq_validation_20260916093518_197e7fc6` was also removed, with absence verified. The 22-case correction run (session `85911`) completed with **21 passed and 1 failed** in 490.48 s ([retained evidence](validation-evidence/2026-09-16/reversal-correction-database.txt)). Terminal operations (9) and withdrawal reversal (2) passed, closing the unique-reference defect. A concurrent-withdrawal regression exposed two provider dispatch calls. Schema `hq_validation_20260916101018_64a39ace` was removed and absence verified. Root approved the dispatch-lease correction; independent source review and the final corrected database run passed.

The final serial run passed **47/47 cases across six files in 958.67 s** on 16 September (session `62160`). It covered operation recovery (17), terminal operations (9), withdrawal outcomes (11), withdrawal reversal (3), transfer dispatch leases (5) and webhook handling (2). Eight-connection isolation, all seven migrations and drift passed. Schema `hq_validation_20260916102859_2c3ffd34` was removed and absence verified. The full [final database evidence](validation-evidence/2026-09-16/dispatch-final-database.txt) is retained.

The [dispatch check manifest](validation-evidence/2026-09-16/dispatch-checks.txt) records passing API production/test typechecks, focused production/test lint and five overlapping pure regressions after correction. It also preserves intermediate type/lint failures and their successful reruns. Root resolved a root ESLint parser ambiguity while preserving the concurrently added documentation override. These focused results do not assert that all current workspace changes passed the historical 14-task suite.

## Review corrections

- The correction run exposed overlapping transfer retries dispatching twice. The implemented five-minute operation-payload lease excludes concurrent owners under brief database locks, retaining the original provider reference and keeping network calls outside transactions. Busy callers return pending; release matches the owning token and expiry uses the database clock. Independent review found stale verification/callback success could override a durable capacity-blocked reversal. Service checks now run after verification/dispatch and within settlement; webhook success also checks reversal precedence. Reversal recovery runs after the original transaction releases its lock, preserving lock order. A new deterministic paused-verification test includes a delayed success callback, unchanged blocked status and eventual exactly-once credit. The reversal suite’s three cases and the lease suite’s five cases passed in the final run, alongside source review and focused test lint, closing the identified race and stale-success findings.
- The 16 September database run found a genuine reversal failure: an original RECORDED transfer owned its unique provider reference, and the local reversal attempted to copy that reference. `createMany(skipDuplicates)` silently skipped the conflicting reversal. The fix removes `providerRef` from the local-only reversal and retains its correlation in `payload.reversalReference`. Root approved the diff and recovery path; stronger ownership, null-reference and concurrency assertions were added. The completed run’s 136 passes and one failure remain evidence. The correction’s API static checks and two pure precedence regressions passed ([retained evidence](validation-evidence/2026-09-16/withdrawal-reversal-static-precedence.txt)). The correction run subsequently passed terminal operations (9) and withdrawal reversal (2), closing this defect; withdrawal outcomes passed 10 of 11 and exposed a separate concurrent-dispatch race.
- Normal transfer retries and the legacy RECORDED/PROCESSING recovery branch now honor a persisted withdrawal reversal before provider access and after verification. Capacity-blocked compensation stays pending. Current pure regressions assert zero provider verification/transfer calls when that reversal takes precedence; historical database coverage verified capacity recovery and exactly-once credit.
- Socket actions check subscriber readiness. The real isolated Redis regression proves rejection when subscription access is lost while publishing remains healthy.
- Malformed or primitive JSON now returns generic 400; oversized bodies return generic 413 before unexpected-error logging can receive the raw body. All four current HTTP regressions and affected static checks passed.
- Checkout scope fencing prevents stale callbacks after account/event changes or unmount. Mobile lint and strict optional-field/test typing issues were corrected and verified.

## Acceptance limits

Native checkout/reconnection, actual provider checkout or TEST-provider certification, deployed multi-host behavior, live financial activity, merge and deployment are not established by these tests. The current checkout was committed by the user before resumption; agents have not committed or deployed this batch.

Legacy access tokens remain REST-compatible until expiry but need refresh/login for sockets. Rotation requires reconnect with the new token; logout revokes the supplied refresh session while independent logins remain valid. Current account, role, expiry and revocation checks do not recall packets already authorized or in flight. API and worker rollout must be coordinated because the guarded Redis envelope protocol differs from the old adapter protocol. Outages drop convenience signals; authoritative state is recovered through API reads. Durable outbox delivery and a comprehensive shutdown deadline policy remain outside this batch. The dispatch lease provides bounded exclusion, not an absolute exactly-once network guarantee across pauses exceeding its lifetime; recovery retains the same provider reference and verifies before reissue.

Checkout email and hosted URLs are scrubbed by erasure, while financial recovery continues. Existing idempotency fingerprints can retain the submitted email; root recorded that remaining inventory/retention work on OVA-146, still Todo. This batch does not establish erasure of every personal-data copy.

Graph tools were unavailable during the 14 September review, which used source fallback at Verify tier. Resumption used project `Users-leslieisah-app-dev-hire-quick`, fast generation `2026-09-16T09:34:24Z`. The discovered `createApp` snippet has matching metadata and no recorded coverage issue; excluded tests/documentation were read directly. The later dispatch review used full graph generation `2026-09-16T10:22:24Z` plus inbound call tracing and direct current-source reads. `transfer-dispatch.ts` had a recorded partial parse at line 28, so its entire source was read; service, recovery, operation runner and webhook coverage had matching metadata and no recorded issue. Coverage is best effort, not exhaustive.

## Final acceptance and count provenance

**251 distinct batch tests passed**: 79 current non-database cases + 137 integrated cases, including the corrected original failure + 29 historical financial cases + 6 new database cases. There are **224 distinct passes from 16 September** and **27 additional historical passes from 14 September**. Two original withdrawal-reversal cases were rerun on 16 September and therefore overlap the historical financial set. Repeated correction/static/pure runs are not added again. Both failed-run histories are retained above; all identified failures passed after correction, and every owned schema has verified cleanup.

Root’s final Linear readback returned all **103 issues**, with `hasNextPage: false`: **28 In Review, 36 Todo, 4 In Progress, 11 Backlog and 24 Done**. OVA-135, OVA-175 and OVA-144 each read back as **In Review**. Evidence and implementation limits were appended before advancement. Root’s repository diff check passed; no merge or deployment is claimed.
