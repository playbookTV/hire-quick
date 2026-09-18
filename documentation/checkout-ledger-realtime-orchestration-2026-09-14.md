# Checkout, ledger and realtime batch — 14–16 September 2026

Root coordinated three implementation agents, independent review, integration and serial database validation. The saved implementation was present in user-authored commit `775d928` when work resumed on 16 September. Concurrent unrelated workspace changes are preserved.

| Ticket | Implementation owner | Scope | Status |
| --- | --- | --- | --- |
| OVA-135 | withdrawal_flow | Durable checkout recovery, unpaid reservation expiry and late charges | In Review |
| OVA-175 | provider_adapter | HOLD conservation and accumulated integer limits | In Review |
| OVA-144 | validation | Shared message validation and live socket authorization | In Review |

## Coordination and review

The checkout and ledger workers agreed the expiry/late-charge boundary before editing shared financial paths. Root integrated durable withdrawal reversal recovery. The realtime worker independently reviewed the ledger guards; the ledger worker reviewed checkout financial/privacy behavior. Root owns database execution and Linear updates.

On continuation, `validation_resume` independently checked the parser fix, reran pure and actual local transport checks, and maintained the validation report. `reversal_reference_fix` corrected the unique-reference collision found by the integrated database run; root reviewed the correction and arranged the affected financial rerun. Agents did not run database suites concurrently or contact real providers. The second financial failure was corrected with a database-backed dispatch ownership lease and deterministic barrier tests. Independent review added reversal precedence during in-flight verification and success callbacks; the reviewer authored that regression separately from the implementation worker.

Graph tools were unavailable initially. On 16 September root indexed `Users-leslieisah-app-dev-hire-quick` at generation `2026-09-16T09:34:24Z`; initial fast-mode test/docs exclusions were read directly. Later full-mode coverage at `2026-09-16T10:00:27Z` had no recorded gap for the correction files; the Prisma schema remained partially parsed and relevant constraints were checked in source. This is Verify-tier evidence, not an exhaustive graph audit.

## Validation evidence

- **79 current non-database cases passed**: checkout/mobile/provider contracts, ledger/dispatch guards, socket security, four loopback parser cases and six actual local Redis/Socket.IO cases. Current API production/test typechecks and focused lint passed; correction-specific checks and the two existing precedence regressions also passed.
- The 16-file integrated run completed **136 passed / 1 failed** in 2049.46 seconds. Eight simultaneous connections verified schema isolation; all seven migrations and drift checks passed. The failed reversal case exposed a real provider-reference uniqueness conflict, corrected below. Its disposable schema was removed and absence verified.
- The first corrective financial rerun completed **21 passed / 1 failed** in 490.48 seconds, with verified cleanup. It closed the reference collision but exposed intermittent concurrent duplicate provider dispatch. The strict one-dispatch and one-debit assertions were preserved, with a deterministic pause added to reproduce the race.
- The **47-case final financial rerun passed in full** in 958.67 seconds after the dispatch/reversal race corrections. It covers operation recovery (17), terminal operations (9), withdrawal outcomes (11), withdrawal reversals (3), dispatch ownership (5), and webhooks (2). Seven migrations, eight-connection isolation and drift passed; all final static/pure checks passed before this run. Schema removal was verified.
- Historical 14 September evidence: **29 financial database cases passed** and **14 workspace static tasks passed**. The old temporary logs are unavailable; these results remain dated historical evidence. This does not certify concurrent unrelated mobile/configuration changes in the current workspace.
- The interrupted 14 September integrated run is not counted as completed. Root found its orphan disposable schema, checked for referencing connections, removed only that owned schema and verified absence. The earlier completed-run schema was already absent.

Retained logs and exact deduplicated totals are in [the validation report](checkout-ledger-realtime-validation-2026-09-14.md) and [the evidence directory](validation-evidence/2026-09-16/).

## Corrections and acceptance boundaries

Review corrected both normal retry and legacy recovery paths that could overlook an existing reversal intent. Capacity-blocked compensation remains durable and never dispatches another transfer. Integrated testing then found that a local reversal copied the original dispatch's unique `providerRef`, preventing its insertion after a recorded success. The original dispatch now retains that field; the local-only reversal binds evidence through `payload.reversalReference`. Concurrent reversal and capacity-boundary fixtures explicitly check ownership, balances and one credit. A five-minute database-backed dispatch claim now spans verification, same-reference POST and durable checkpointing; busy callers remain pending. Expired owners can be replaced, and an old owner cannot clear a replacement claim. Durable reversal evidence outranks stale success in recovery and webhook paths without reversing the transaction lock order.

Checkout uncertainty preserves the original identity and reservation. Expiry uses proven evidence; late captured charges become refundable liability while expired bookings remain cancelled. Export/erasure scrubs checkout email/URLs and fences in-flight responses. Existing input-email retention in financial idempotency fingerprints remains tracked in OVA-146; complete erasure inventory is not claimed.

Socket acceptance covers live account/session/audience checks, bounded input and quotas, recipient-authorized fanout and Redis outage behavior. Invalid JSON/oversized parser failures return generic client errors without raw-body error logging. The fanout protocol requires coordinated API/worker rollout; signals are not a durable outbox.

Native checkout/reconnection, deployed multi-host networking and actual provider certification are outside the automated evidence. No merge, deployment or real financial transfer was performed by this continuation.

A concurrent root ESLint extension exposed ambiguous parser-root inference. Root added an explicit global `tsconfigRootDir` while preserving that extension; affected production files and the documentation-check script passed focused lint. Unrelated concurrent workspace changes remain outside this batch’s acceptance claims.

## Final acceptance and Linear readback

All three tickets are **In Review** with implementation details, correction history, evidence and limits appended in Linear. The complete 103-issue readback has no next page: **36 Todo, 4 In Progress, 28 In Review, 24 Done, 11 Backlog**. The selected statuses are saved in [the readback](validation-evidence/2026-09-16/linear-readback.json).

**251 distinct cases passed across this batch:** 224 on 16 September plus 27 additional historical ledger cases. This deduplicates the 79 current non-database cases, 137 integrated-scope cases, 29 historical ledger cases and six new database regressions; repeated runs and the two historical reversal cases rerun today are not added twice. Both discovered financial failures are corrected and validated; the failed-run evidence is retained. All owned disposable schemas were removed and cleanup verified.
