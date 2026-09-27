**HireQuick codebase examination — 11 September 2026**

Reviewed revision: `f36d1c7`. The working tree was clean at the start. The initial examination changed only this report. The implementation follow-up below records subsequent changes; finding descriptions and line references otherwise describe the reviewed revision.

**Assessment**

HireQuick has substantial working infrastructure and a coherent domain model. Its centralized ledger, integer money representation, explicit state transitions, and separation of provider adapters are useful foundations. The current implementation nevertheless has release-blocking identity-verification and payment-orchestration defects. Successful builds and existing tests do not establish readiness to process live funds.

The most urgent defect is an unsigned KYC webhook that can approve a caller-controlled verification result. Payment risks include treating uncertain transfers as failed, issuing refunds before validating refundable state, and recovery paths that can duplicate ledger entries or leave debited withdrawals stranded.

**Pending work at a glance**

**Initial review: 36 findings — 1 P0, 12 P1, and 23 P2.** Findings #2–5 are implemented and have passed their targeted database regressions. The other 32 findings remain open (including partially improved #6 and #24). The deeper pass added findings 22–36. Statuses and TODOs distinguish completed changes from remaining work.

| Pending category                                | Main items                                                                                  | Required next result                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **PENDING — SECURITY / MONEY FIXES**            | Unsigned KYC #1; remaining provider/recovery work #6 and #24; cross-owner object deletion #22 | Regression evidence for authorization, external effects, crash recovery, and concurrent execution |
| **PENDING — CORE WORKFLOWS**                    | Checkout #7; event invariants #13; native KYC #23; verification updates #32                 | Working end-to-end paths, including cancellation, resumption, and failure states                  |
| **PENDING — PRODUCT DECISIONS**                 | Post-release disputes #8; late cancellation #9; refund fees and held-wallet model           | Recorded decisions translated into shared policy, ledger behavior, and accurate UI copy           |
| **PENDING — SESSION / DATA / OPERATIONS FIXES** | Remaining P2 findings, especially #18, #25–26, #30–31, #34 and #36                          | Targeted failure/race tests and observable recovery                                               |
| **PENDING — VALIDATION**                        | Isolated Postgres suite, provider contracts, native flows, current dependency audit         | Run evidence; successful compilation alone does not close these items                             |

Suggested ownership below refers to engineering responsibilities, not assigned individuals or agreed deadlines. **PENDING** means unresolved in the reviewed repository or not evidenced during this review; it does not assert that an external business task has never been completed.

**Implementation follow-up — 12 September 2026**

User-selected scope: findings **#2–5**. OTP implementation remains unchanged.

- **#2:** Unknown/pending transfers keep the wallet debit. Only authoritative failure restores funds; later success settles the original withdrawal.
- **#3:** Refund eligibility and the booking reservation commit before provider dispatch. Attendance, release, and dispute freezing respect that reservation. Amount/state errors cannot initiate an external refund.
- **#4:** Dispatch markers and provider-success checkpoints survive separately from ledger recording. Request and recovery paths lock/reread the operation and commit ledger effects with completion. Commission intents reserve fees across periods; uncertain refund retries use read-only reconciliation.
- **#5:** Withdrawal debit and transfer intent commit together. Checker authorization and approval intent commit together; `EXECUTED` follows actual completion. Dispute settlement is atomic, with replay repairs for legacy partial commits and missing intents.

Validation completed against a temporary schema on the configured live Neon database, using in-memory payment providers. No Paystack money movement was part of these tests. All five tracked migrations applied and the migration drift check reported no difference; no application schema migration is required by these changes.

| Follow-up check | Result |
| --- | --- |
| Recovery, concurrent refunds/withdrawals, admin approvals and scheduled jobs | 26 unique database tests passed, including 17 maintained recovery regressions |
| Existing ledger, webhook and reconciliation suites | 10 tests passed |
| Booking lifecycle | 3 tests passed after fixing a missing idempotency header and an expired fixed-date dispute fixture; no OTP or dispute-policy implementation changes |
| Operation runner and HTTP provider contract tests | 17 tests passed; includes timeout/unknown/pending states, paginated refund lookup, mismatched amounts and duplicate provider evidence |
| Static checks | API typecheck and lint passed; a separate no-emit config explicitly typechecked all four changed/new test files, which normal API typecheck excludes |
| Migration validation | Five migrations applied; database-to-model drift check clean |

**Total: 39 database tests and 17 unit/adapter tests passed (56 unique tests).** These are targeted payment/approval/booking checks, not the entire repository suite or a live Paystack certification.

The first run exposed a validation configuration problem: Prisma queries targeted the isolated schema while some raw SQL targeted `public`. That run was stopped and discarded as concurrency evidence. Direct connections plus an explicit PostgreSQL `search_path` were then verified across eight connections before rerunning. Temporary fault-injection triggers/functions were checked and removed. The initial pooled migration also left a session advisory lock. Automatic approval review rejected terminating its idle pooled connection because of shared-service risk; that termination was not performed. The lock subsequently cleared on its own, confirmed by a final read of `pg_locks`. All temporary fault-injection functions/triggers were absent at the final catalog check, and both temporary validation schemas were removed. The validation runner overrode the configured pooled URLs locally; deployment secrets/configuration were not changed.

**Remaining operational work:** review unresolved/failed provider operations using provider evidence; do not blindly reset refund attempts or reissue an ambiguous refund. An intent marked before a POST that never happened deliberately remains pending. Provider account/sandbox validation, terminal sweep-reversal handling (#6), and durable notification/audit delivery remain separate work. Changes also improve pending-result semantics (#6) and recovery rotation (#24), but those findings are not fully closed.

**Scope and evidence**

The examination covered API startup and configuration, authentication, KYC, events and applications, booking/attendance transitions, ledger writes, Paystack HTTP/webhook integration, payment recovery, scheduled jobs, admin authorization and approvals, privacy/storage/audit code, mobile HTTP/session/query infrastructure, principal checkout/withdrawal/cancellation screens, admin screens, Prisma schema/migrations, package configuration, CI, Dockerfiles, and relevant PRD/TRD sections.

Tracked-source inventory, excluding generated output and declaration files:

| Area          | TS/TSX files | Lines, including tests | Test files |
| ------------- | -----------: | ---------------------: | ---------: |
| API source    |           73 |                  9,350 |         21 |
| Admin source  |           14 |                    652 |          0 |
| Mobile        |          134 |                 12,235 |          0 |
| Shared source |           10 |                    871 |          4 |

The Prisma schema contains 35 models; five migration SQL files are tracked. These are inventory counts, not a claim that every line received equal scrutiny.

The requested knowledge-graph tools were unavailable in the tool catalog, including tool discovery. Consequently, graph project/generation and index coverage could not be verified. Discovery and verification used direct source reads and bounded `rg` searches. No graph completeness claims are made.

Findings below distinguish local executable probes from source-traced behavior. Database-dependent probes used explicit in-memory stubs and a dummy database URL; they did not touch the configured database or external providers. They demonstrate application control flow, not PostgreSQL concurrency behavior. No live UI interaction, native-device run, provider-account audit, or legal-compliance certification was performed. A dependency audit was attempted during the deeper pass but failed to reach the npm registry; it produced no current advisory result.

**Architecture as implemented**

The six workspaces form a modular monolith with two backend processes. Express serves HTTP and Socket.IO; a separate BullMQ worker runs lifecycle, recovery, reconciliation, retention, and audit jobs. Both operate on the same Prisma/Postgres data model. Redis supports rate limiting, scheduled work, and socket fan-out.

`packages/shared` owns fee calculations, policy matrices, state transitions, enums, and request schemas. `packages/database` exports the Prisma singleton and types. The mobile app uses Expo Router, React Query, SecureStore, Restyle, and shared domain logic. Admin uses Vite/React and a small custom request/session layer. Contrary to repository guidance, admin does not currently depend on `@hq/shared`; response contracts are also handwritten independently across surfaces.

The primary money path is:

```text
accepted applications
  → confirmBatch: PENDING order + PENDING_PAYMENT bookings
  → hosted Paystack checkout
  → verified charge webhook: HOLD allocations + CONFIRMED bookings
  → check-in and completion, or eligible automatic completion
  → RELEASE + FEE, wallet CREDIT, booking PAID
  → withdrawal request: wallet DEBIT
  → Paystack transfer and terminal webhook
```

Booking `PAID` means credited to the internal wallet. Withdrawal `PAID` means bank-transfer completion. These are different milestones, and some UI/provider code currently blurs them.

The ledger functions accept caller transactions and lock booking, order, wallet, or withdrawal rows. A bounded search of non-test API source found escrow/wallet ledger creation and wallet-balance updates centralized in `payments/ledger/ledger.ts`. Provider interfaces are injected, although several services and recovery helpers still directly import the global Prisma singleton, limiting isolation. `ApiError` lives in `app.ts`, creating dependency cycles when routers/services import the application composition root.

**Prioritized findings**

P0 means an immediate security blocker. P1 means a serious money, recovery, or core-workflow defect. P2 means an important correctness, privacy, or operational issue. These priorities are engineering judgments based on the observed code.

**1. P0 — An unsigned KYC callback can mark an usher verified.**

Source: `apps/api/src/modules/verification/port/dojah-kyc.ts:94`; `apps/api/src/modules/verification/routes.ts:55,88,136`.

`verifyWebhook` validates HMAC only inside `if (sig)`. With the signature absent, it parses and trusts the supplied biometric signals. An authenticated usher can start KYC, receive their reference ID, and submit an unsigned result referencing that session. The public webhook writes `verificationStatus: VERIFIED` when the parsed result passes.

Evidence: the actual adapter returned `decision: verified` for a synthetic unsigned payload. The route's resulting database update was traced in source. Require authenticated provider evidence on every callback; reject missing authentication and reconcile the result with an authoritative provider lookup where appropriate. Also constrain stale/replayed session results so an old callback cannot overwrite a later verification decision.

**Status: PENDING — FIX.**

- [ ] **TODO #1:** Reject missing/invalid callback authentication; test forged, replayed, stale, and out-of-order results against the real router.

**2. P1 — An uncertain transfer can restore funds that have already left the platform.**

Source: `apps/api/src/modules/payments/port/http-paystack.ts:111`; `apps/api/src/modules/payments/service.ts:201`; `apps/api/src/modules/payments/ledger/ledger.ts:329,350`.

`HttpPaystack.transfer` catches every exception and returns `failed`. This includes a connection reset after the provider accepted a transfer. `initWithdrawal` then reverses the wallet debit and makes the withdrawal terminally `FAILED`. A subsequent success webhook is ignored by `completeWithdrawal` for that status. The usher can receive the transfer while retaining a spendable wallet balance.

Evidence: an injected transport exception returned terminal failure. Preserve an uncertain/pending state, verify the deterministic reference, and reverse only after authoritative failure evidence. Add transport-loss and out-of-order webhook tests.

**Status: IMPLEMENTED — TARGETED DATABASE REGRESSIONS PASSED (12 SEPTEMBER).**

- [x] **TODO #2:** Keep uncertain transfers pending; prove that a late success after transport loss cannot coexist with a restored spendable balance.

**3. P1 — Refunds reach the provider before refundable state is checked.**

Source: `apps/api/src/modules/payments/service.ts:46`; `apps/api/src/modules/admin/service.ts:58`; `apps/api/src/modules/payments/ledger/ledger.ts:233`.

The refund orchestrator only short-circuits an already `REFUNDED` booking before contacting Paystack. The held/frozen escrow and legal-state checks happen afterward in `refundBooking`. Admin's preliminary validation checks the requested amount against the original gross amount, which also exists after payout.

Evidence: with a `PAID` booking and `RELEASED` payment, the actual orchestrator invoked the stubbed refund provider, then threw `NOT_REFUNDABLE`. This can refund the client after the usher has already been paid without a corresponding refund ledger entry. No-show/cancellation races with check-in or release expose the same ordering problem. Reserve and validate the refund atomically before initiating the external effect; reconcile uncertain outcomes afterward.

**Status: IMPLEMENTED — TARGETED DATABASE REGRESSIONS PASSED (12 SEPTEMBER).**

- [x] **TODO #3:** Reserve refundable state before contacting the provider; test paid bookings and concurrent release/refund attempts with zero unintended external refunds.

**4. P1 — Operation checkpoints and recovery are not crash-atomic.**

Source: `apps/api/src/modules/payments/ledger/operations.ts:73`; `apps/api/src/modules/payments/recovery.ts:75,100`.

`runOperation` performs the provider call, writes `PROVIDER_OK`, records the ledger, and writes `RECORDED` in one database transaction. If recording fails, `PROVIDER_OK` rolls back too. The persisted operation is still `PENDING`; there is no durable intermediate checkpoint despite the comments. Refund recovery refuses to resume `PENDING` operations.

Commission recovery has the opposite gap: it commits `commissionSweep` and then calls `markOp` separately. A crash between those commits, or overlapping recovery with stale operation input, can append the same sweep again. It neither locks/re-reads the operation nor records completion atomically with the ledger.

Evidence: transaction-stub rollback caused the actual runner to invoke the provider twice across a retry. Replaying the actual commission recovery with the same operation appended two sweep entries. Use one consistent operation protocol with durable intent, authoritative provider reconciliation, and an atomic ledger-plus-terminal-status commit. A database transaction cannot undo an external transfer.

**Status: IMPLEMENTED — TARGETED DATABASE REGRESSIONS PASSED (12 SEPTEMBER).**

- [x] **TODO #4:** Persist intent before effects and commit ledger plus terminal operation status atomically; pass crash-boundary and simultaneous-recovery tests.

**5. P1 — Crashes can strand withdrawals and approvals before their recovery records exist.**

Source: `apps/api/src/modules/payments/service.ts:180`; `apps/api/src/modules/admin/service.ts:163`; `apps/api/src/modules/payments/recovery.ts:133`; `apps/api/src/modules/jobs/jobs.ts:79`.

A withdrawal debit commits before `claimOperation`. If the process stops in between, a request replay returns the stored withdrawal ID without creating its transfer operation. The stuck-withdrawal pass only verifies the reference; an unknown transfer remains pending indefinitely.

Approvals similarly become `EXECUTED` before `executeApprovalOp` creates a durable operation. A crash in that interval leaves a supposedly executed approval with no money action and no operation for the recovery query to find. Dispute release also commits its payout before updating the dispute row; a replay can then fail on the booking's new state, leaving the dispute unresolved.

Create the recoverable intent in the same transaction as the debit/approval claim. Separate claimed/in-progress status from execution completion, and make replay repair all remaining state changes.

**Status: IMPLEMENTED — TARGETED DATABASE REGRESSIONS PASSED (12 SEPTEMBER).**

- [x] **TODO #5:** Create recovery intent with the debit/approval claim; replay and reconcile records stranded at every intervening commit boundary.

**6. P1 — Accepted provider requests are treated as completed financial outcomes.**

Source: `apps/api/src/modules/payments/port/http-paystack.ts:111,148`; `apps/api/src/modules/payments/recovery.ts:48,75`; `apps/api/src/modules/payments/webhooks/paystack-webhook.ts:173`; `apps/api/src/modules/payments/service.ts:237`.

The transfer adapter collapses `pending` and `otp` into `success`. The first withdrawal path retains `PROCESSING`, but recovery can immediately mark a re-issued transfer `PAID`; commission sweeps record a completed sweep for that same nonterminal result. Sweep failure/reversal callbacks have no matching withdrawal and are ignored.

Refund creation unconditionally returns `processed`; a matching merchant note also counts as success regardless of the existing refund's status. Refund terminal events are ignored. Paystack documents asynchronous transfer completion and a queued/pending response for refund creation. [Transfer lifecycle](https://paystack.com/docs/transfers/single-transfers/), [Refund API](https://paystack.com/docs/api/refund/).

Preserve provider states and IDs, handle terminal refund/sweep events, and reconcile unresolved operations. The refund-list lookup also uses a charge reference where the documentation specifies a transaction ID and discards pagination metadata; validate that contract against the provider rather than relying on the two current mocks.

**Status: PENDING — FIX.**

- [ ] **TODO #6:** Model accepted, pending, completed, failed, and reversed outcomes explicitly; exercise asynchronous refunds, withdrawals, and commission transfers.

**7. P1 — Abandoning checkout can strand staffing reservations and block retry.**

Source: `apps/api/src/modules/bookings/service.ts:95`; `apps/mobile/lib/hooks.ts:289`; `apps/mobile/app/(modals)/payment-summary.tsx:45`; `apps/mobile/app/(modals)/funds-held.tsx:25`.

Confirmation creates pending bookings, counts them toward headcount, and can mark the event fully staffed before payment succeeds. Mobile rotates the idempotency key after receiving the checkout URL, and a remounted screen creates another key. Reconfirming those applicants then raises `ALREADY_CONFIRMED`. The funds-held screen says users can restart from their event, but the examined mobile source has no order-charge resume call. No pending-payment expiration job appears in the scheduled-job implementation.

Persist a resumable checkout/order identity and provide a supported resume/expiry flow. Test closing checkout, app termination, failed initialization, and lost responses. Any expiry design must also handle a late successful charge.

**Status: PENDING — FIX.**

- [ ] **TODO #7:** Persist and resume the original checkout intent; define expiry/release of unpaid reservations and test restart, cancellation, and late charge callbacks.

**8. P1 — The advertised 72-hour dispute window disappears after automatic payout.**

Source: `apps/api/src/modules/bookings/service.ts:285,351`; `packages/shared/src/state-machines.ts:18`; `apps/api/src/modules/payments/ledger/ledger.ts:280`; PRD §13 and TRD §12.

Automatic completion releases funds at event end plus grace, normally one hour. Disputes require held escrow, and `PAID` has no dispute transition. A client trying to dispute later that evening can therefore be within the documented 72-hour window but unable to open a dispute. The restriction is explicitly intentional in comments because clawback/debt is unimplemented; it is still a material product-contract gap.

Choose and implement a consistent hold/dispute policy, or an explicit post-payout dispute and recovery mechanism. This requires a product decision before changing money semantics.

**Status: PENDING — DECISION + IMPLEMENTATION.**

- [ ] **TODO #8:** Resolve the 72-hour dispute versus early wallet-release conflict; implement and test the approved post-release dispute/settlement behavior.

**9. P1 — Late client cancellation has no implemented policy settlement path.**

Source: `apps/api/src/modules/bookings/service.ts:448`; `apps/api/src/modules/admin/service.ts:58`; `apps/mobile/app/(modals)/cancellation.tsx:62`; PRD §13.

The shared matrix defines 50/50 and full usher-compensation windows, but the API rejects non-100% client refunds with `PARTIAL_CANCEL_UNSUPPORTED`. Mobile sends these users to support. The admin refund service likewise accepts only a full booking refund; the inspected admin API has no 50/50 cancellation settlement action. This is a deliberate incomplete feature, not merely a missing button. Implement an audited settlement operation matching the matrix before claiming those cancellation policies are supported.

**Status: PENDING — IMPLEMENTATION.**

- [ ] **TODO #9:** Implement the approved late-cancellation split through ledger and provider operations; prove client refund plus usher payout plus fees conserves the allocation.

**10. P2 — Concurrent refresh-token reuse mints multiple successor sessions.**

Source: `apps/api/src/modules/auth/routes.ts:48`; `apps/api/src/modules/auth/tokens.ts:49`.

The denylist read happens before signing, and revocation uses an idempotent upsert. Concurrent callers can both pass the read and both receive fresh token pairs. Evidence: invoking the actual route and JWT helpers concurrently with controlled database stubs returned two distinct successor refresh tokens for one input token. Claim single use atomically and define session-family reuse handling.

**Status: PENDING — FIX.**

- [ ] **TODO #10:** Consume each refresh token atomically; simultaneous reuse must produce at most one valid successor session.

**11. P2 — Mobile logout does not revoke its refresh token; transient startup failures erase it.**

Source: `apps/mobile/lib/auth-context.tsx:84,103`; `apps/api/src/modules/auth/routes.ts:88`.

Mobile posts `/auth/logout` without the required body. The backend intentionally returns 204 for invalid/missing bodies, so local logout appears successful while the refresh token remains valid. Separately, any cold-start `/api/me` error or eight-second timeout clears stored tokens, including ordinary offline/server failures. Send the refresh token on logout, distinguish invalid sessions from temporary connectivity failures, and prevent in-flight hydration/refresh work from restoring stale session state after logout.

**Status: PENDING — FIX.**

- [ ] **TODO #11:** Send the refresh token on logout; preserve credentials on transient startup failures and test offline launch and logout/revocation.

**12. P2 — Venue masking is bypassed through invitation and pending-booking responses.**

Source: `apps/api/src/modules/events/routes.ts:436,450`; `apps/api/src/modules/bookings/routes.ts:36,63`.

Discovery, application lists, and saved jobs apply venue masking. Invitation responses return the full event without masking, and booking responses expose the venue for `PENDING_PAYMENT` bookings. An invited or not-yet-paid usher can obtain the exact venue before the promised escrow gate. Apply one role/state-aware event serializer to every response path.

**Status: PENDING — FIX.**

- [ ] **TODO #12:** Apply one authorized event serializer to every response path; pending-booking and invitation tests must not expose precise venue.

**13. P1 — Event edits bypass time and aggregate-money invariants.**

Source: `packages/shared/src/dto.ts:108`; `apps/api/src/modules/events/routes.ts:223`.

PATCH validates time ordering only if both times are submitted, and the route rechecks only merged accommodation. An event starting at 10:00 accepts an end-time-only edit to 09:00. PATCH also lacks the create schema's aggregate budget cap: individually valid headcount and per-head budget can produce an order total exceeding Postgres `Int` capacity.

Evidence: the actual PATCH schema accepted both cases that the create schema rejected. Validate the complete merged event under the same lock used for confirmation. The current edit gate also reads booking count outside a transaction, so it can race with confirmation.

**Status: PENDING — FIX.**

- [ ] **TODO #13:** Validate the merged event and aggregate cost inside the lock used for confirmation; reject invalid partial edits and edit/confirm races.

**14. P2 — Mobile cancellation calculations differ from the API by one hour.**

Source: `apps/mobile/app/(modals)/cancellation.tsx:29`; `apps/api/src/modules/bookings/service.ts:64`.

The API converts Lagos wall time to UTC by subtracting one hour; the cancellation screen treats the same wall time as UTC. Between 48 and 49 apparent hours before an event, the screen can advertise a full refund while the server applies the late-cancellation gate. The screen also hard-codes a non-refundable processing-fee label even though that deduction is disabled in shared policy. Share event-time conversion and use the actual configured fee policy.

**Status: PENDING — FIX.**

- [ ] **TODO #14:** Share Lagos event-time and cancellation calculations; test both sides of the 12/48-hour boundaries and display the actual fee policy.

**15. P2 — A synchronously failed withdrawal still shows a successful transfer receipt.**

Source: `apps/api/src/modules/payments/service.ts:201`; `apps/api/src/modules/payments/http/routes.ts:238`; `apps/mobile/lib/hooks.ts:386`; `apps/mobile/app/(modals)/withdraw.tsx:129`.

`initWithdrawal` ignores `runOperation`'s failed outcome and returns an ID; the route responds successfully and emits `PROCESSING`. Mobile's success callback unconditionally shows “Your money is on its way,” even when the wallet debit was reversed. Its hook expects `{ id, status }`, while the actual response is `{ withdrawalId, duplicate }`. Return a shared, accurate withdrawal result and render pending/failed/completed states from it.

**Status: PENDING — FIX.**

- [ ] **TODO #15:** Align withdrawal response types and UI states; a failed/pending transfer must not render a completed-transfer receipt.

**16. P2 — Socket sessions bypass HTTP validation and remain authorized after suspension.**

Source: `apps/api/src/realtime/gateway.ts:102,172`; `apps/api/src/realtime/messages.ts:65`; `apps/api/src/modules/bookings/routes.ts:165`.

Account status and token validity are checked at socket connection only. Existing sockets are neither disconnected nor rechecked when an admin suspends a user. Message handlers check booking participation, not live account status. They also accept unvalidated payloads directly, bypassing REST's 4,000-character content bound and its HTTP rate limiter. Put validation and account eligibility in shared message operations and enforce socket-specific limits/session invalidation.

**Status: PENDING — FIX.**

- [ ] **TODO #16:** Share message validation/limits across transports and invalidate socket authorization on account/session changes; test existing connections after suspension.

**17. P2 — Audit verification does not detect deletion of the chain tail.**

Source: `apps/api/src/modules/audit.ts:95`.

The verifier validates remaining rows but never compares the final hash with `audit_chain_head`. Its first-row handling also does not require a valid chain origin. Evidence: after writing two synthetic entries through the actual writer with database stubs, removing the last entry still returned `ok: true` despite the stored head pointing to the removed row. Validate origin and terminal anchors in a consistent snapshot; define an external anchor if detection must survive an attacker modifying both rows and head.

**Status: PENDING — FIX.**

- [ ] **TODO #17:** Verify the chain origin and durable head, with an independent anchor strategy; detect tail truncation and a missing first segment.

**18. P2 — Deletion failures lose the information required to retry.**

Source: `apps/api/src/modules/jobs/jobs.ts:134`; `apps/api/src/modules/privacy/service.ts:94`; `apps/api/src/modules/privacy/routes.ts:56`.

Retention ignores rejected object deletes with `Promise.allSettled`, then clears document references or removes message rows. Erasure likewise clears references before best-effort object deletion and reports the number attempted as `objectsDeleted`. The inspected jobs contain no durable retry queue for those lost keys. Erasure also overwrites message content before collecting image/voice object keys and leaves `Client.businessName` intact, which may identify an individual.

Persist deletion intents and outcomes, retry failed objects, collect media keys before scrubbing, and reconcile the erasure inventory with stored profile fields. This is an implementation finding against the repository's retention promises, not a legal determination.

**Status: PENDING — FIX.**

- [ ] **TODO #18:** Persist retryable deletion work before clearing references; prove failed object deletion can resume and return accurate completion counts.

**19. P2 — Idempotency is not bound to the authenticated caller or request contents.**

Source: `apps/api/src/modules/payments/ledger/idempotency.ts:15`; `apps/api/src/modules/payments/service.ts:180`; `apps/api/src/modules/bookings/service.ts:98`.

Keys are namespaced only as `order:<key>` or `withdrawal:<key>`. Reusing a key across users or changing an amount/destination can replay an unrelated stored result without rejecting a payload mismatch. Paid-order replay can return stored booking IDs before checking ownership of that replayed order; withdrawal replay can return another user's withdrawal ID. Concurrent first uses can also race on the unique insert and surface a generic error instead of the original result.

Scope keys to caller and operation, persist a request fingerprint, reject mismatches, and handle the unique-constraint loser as a replay. Treat a genuinely new payment intent separately from retrying an uncertain old one.

**Status: PENDING — FIX.**

- [ ] **TODO #19:** Bind keys to caller, operation, and request fingerprint; reject changed payloads and test concurrent duplicate requests.

**20. P2 — Event and staff eligibility can become stale.**

Source: `apps/api/src/modules/bookings/service.ts:84`; `apps/api/src/modules/events/routes.ts:261`; `apps/api/src/modules/ushers/routes.ts:65`.

Confirmation trusts accepted applications fetched before the event lock and does not recheck usher account status/verification or cross-event schedule conflicts. Discovery filters verification but not active account status. Applying by ID does not validate the event's open/current state. A bounded search found event-status writes on creation/edit/confirmation, but no restoration after cancellation/refund or advancement to completion in the lifecycle jobs. Fully staffed events can therefore stay hidden from discovery after losing staff.

Define authoritative eligibility and event-state transitions, and evaluate them atomically at confirmation. Recompute staffing after terminal booking changes.

**Status: PENDING — FIX.**

- [ ] **TODO #20:** Recheck current event/staff eligibility under transaction locks; define and test event reopening, completion, and scheduling conflicts.

**21. P2 — Admin approval controls lack the context needed for the decision.**

Source: `apps/admin/src/pages/Approvals.tsx:5`; `apps/admin/src/lib/auth.tsx:25`; `apps/admin/src/lib/api.ts:20`.

The approval table presents kind, amount, and maker, but not the booking/event, reason, dispute evidence, or proposed RELEASE versus REFUND outcome stored in the payload. This weakens the practical value of maker-checker review. Admin also discards the refresh token and retains only the access token; there is no renewal or 401-to-login transition, so the default 15-minute token expiry leaves an apparently authenticated console whose API calls fail. These are source-based functional observations, not an interactive usability verdict.

**Status: PENDING — FIX.**

- [ ] **TODO #21:** Show the proposed action and supporting context to checkers; add admin token renewal and explicit expiry-to-login behavior.

**22. P1 — Chat media can make retention delete another user's storage object.**

Source: `apps/api/src/realtime/messages.ts:66`; `apps/api/src/modules/bookings/routes.ts:167`; `apps/api/src/modules/jobs/jobs.ts:165`; `apps/api/src/modules/storage/storage.ts:45`.

An authorized booking participant can submit an `IMAGE` or `VOICE` message containing an arbitrary object key. Neither the REST schema nor the shared message service verifies object ownership, upload issuance, or association with that conversation. Retention subsequently passes `message.content` directly to `storage.deleteObject`, using the server's bucket credentials. An attacker who knows another object's key can therefore turn a chat message into a future deletion request. Booking detail also returns the usher record, including `avatarKey`; knowledge of a key is not equivalent to permission to delete it. Paid bookings remain messageable, allowing an already-old conversation to reach the next purge without waiting another retention period.

Evidence: the actual message service accepted a synthetic key under a different usher's photo prefix; the actual purge then requested deletion of that exact key through a storage stub. No real object was deleted. Exploitation against a deployed bucket additionally depends on its object layout and deletion permissions, which were not inspected.

**Status: PENDING — FIX.**

- [ ] **TODO #22:** Accept only authorized media references and revalidate them before deletion; a known foreign key must never authorize a storage delete.

**23. P1 — The biometric onboarding screen never launches identity verification.**

Source: `apps/mobile/app/(verification)/kyc-consent.tsx:8,36`; `apps/api/src/modules/verification/routes.ts:58`; `apps/mobile/app/(verification)/awaiting-approval.tsx:74`.

The start mutation succeeds, but its callback discards the returned session with `void session` and immediately navigates to awaiting approval. The Dojah SDK launch is a comment, not an implementation. No biometric evidence is collected by this path, while the next screen says “Documents received.” The backend has already created a pending verification and incremented the five-attempt counter; failed starts and repeated abandoned starts also consume attempts. Concurrent starts check the limit before their transaction, so the cap itself is not atomic.

Evidence: source-traced behavior, with an explicit native-widget pending comment. This finding concerns the biometric path; a separate manual-document flow exists. An exported JS bundle does not establish that the native KYC workflow works.

**Status: PENDING — IMPLEMENTATION.**

- [ ] **TODO #23:** Wire the actual native SDK, persist resumable sessions, and count attempts atomically; verify consent, cancellation, retry, and webhook completion on devices.

**24. P1 — One hundred unresolved operations can starve newer payment recovery.**

Source: `apps/api/src/modules/jobs/jobs.ts:77`; `apps/api/src/modules/payments/recovery.ts:100`.

Recovery always selects the oldest 100 `PENDING`/`PROVIDER_OK` operations by creation time. It has no cursor, retry eligibility timestamp, or quarantine for operations that cannot progress. A `PENDING` booking refund always returns `pending`, so 100 such rows permanently occupy that selection. Repeating the job does not advance to later operations. The separate stuck-withdrawal pass can still reconcile already-issued transfers; it does not repair every omitted operation or initiate a transfer that never reached the provider.

Evidence: two executions against a stubbed 101-row dataset selected the same 100 pending refunds; the newer transfer operation was never examined. This reproduces selection/control flow, not database throughput.

**Status: PENDING — FIX.**

- [ ] **TODO #24:** Add fair pagination/retry scheduling and an operator queue for blocked records; prove operation 101 progresses behind 100 unresolved refunds.

**25. P2 — The worker silently drops important Redis URL settings.**

Source: `apps/api/src/modules/jobs/redis.ts:9`; `apps/api/src/modules/jobs/queues.ts:34`.

`redisConnection` extracts only host, port, username, and password. It discards the `rediss:` TLS requirement and database path, and passes URL-encoded credentials without decoding. Consequently the worker can fail TLS/authentication or use a different logical database from clients that consume `REDIS_URL` directly. A working API Redis connection does not establish that scheduled jobs are connected correctly.

Evidence: `rediss://worker:p%40ss@cache.example.test:6380/4` produced no TLS option, no database option, and the literal encoded password. These were synthetic credentials. Deployed Redis configuration was not inspected.

**Status: PENDING — FIX.**

- [ ] **TODO #25:** Preserve TLS, database, and decoded credentials consistently; validate worker connectivity against a disposable TLS/authenticated Redis configuration.

**26. P2 — A logout race can permanently disable mobile token refresh.**

Source: `apps/mobile/lib/client.ts:60`; `apps/mobile/lib/auth-context.tsx:103`.

The shared refresh promise reads tokens and returns early when they are absent before entering its `try/finally`. If an old authenticated request receives 401 after logout cleared storage, that early return leaves `refreshPromise` holding a resolved-null promise forever. A subsequent login in the same app process cannot refresh its access token. A SecureStore read rejection before the `try` has the same cleanup gap. In the other direction, an already-running successful refresh can save old-session tokens after logout because there is no session-generation check.

Evidence: the actual mobile request module was transpiled in memory with token-storage and HTTP substitutes. After the logout/401 ordering, a second synthetic login's expired request failed without making any refresh call. This was a JavaScript control-flow probe, not a native SecureStore test.

**Status: PENDING — FIX.**

- [ ] **TODO #26:** Clear the refresh promise on every exit and scope asynchronous work to its session; test logout, storage rejection, and a second login.

**27. P2 — Declining an accepted invitation leaves its application accepted.**

Source: `apps/api/src/modules/events/routes.ts:463`; `apps/api/src/modules/bookings/service.ts:90`.

The invitation endpoint allows either target status regardless of the current status. Acceptance upserts an accepted application; a later decline updates only the invitation. Confirmation selects accepted applications and never checks that corresponding invitation again. The API can therefore report `DECLINED` while leaving that usher available for booking through the existing accepted application. Hiding the buttons after the first response does not enforce the transition on the server.

Evidence: invoking the actual route on an accepted invitation produced `invitation.status = DECLINED` and retained `application.status = ACCEPTED` in transaction stubs.

**Status: PENDING — FIX.**

- [ ] **TODO #27:** Define allowed invitation transitions and synchronize application eligibility atomically; a successful decline must not leave a confirmable acceptance.

**28. P2 — Batch confirmation silently drops requested applicants.**

Source: `apps/api/src/modules/bookings/service.ts:90`; `apps/api/src/modules/events/routes.ts:492`.

The accepted-application query filters the supplied IDs, then rejects only when zero rows remain. It never checks that every distinct requested ID belongs to this event and is still accepted. If one selected applicant becomes ineligible, the request succeeds with a smaller booking set and a different checkout amount instead of reporting the changed selection. Duplicate IDs are also silently collapsed by the database query. This violates the caller's expectation of confirming the submitted batch atomically.

Evidence: the actual confirmation service accepted two requested IDs with only one accepted result, created one booking, and initialized checkout for one person's pay. Database and provider calls were stubbed.

**Status: PENDING — FIX.**

- [ ] **TODO #28:** Validate the complete distinct requested batch under lock; return a changed-selection conflict before creating any order when one ID is invalid.

**29. P2 — Editing one event preference deletes the others.**

Source: `apps/api/src/modules/events/routes.ts:89,110,248`.

The partial-update mapper replaces the entire `preferences` JSON object whenever `requirements` or `hairstyle` is supplied. It builds that object only from fields in the patch. Changing requirements alone therefore drops an existing hairstyle; clearing one preference can clear the other too. The comment promising updates to “only provided keys” is inaccurate for this nested object.

Evidence: the actual PATCH handler changed requirements and removed an unmentioned hairstyle from a synthetic existing event.

**Status: PENDING — FIX.**

- [ ] **TODO #29:** Merge nested preference fields and define explicit clearing semantics; patching one field must preserve all unmentioned fields.

**30. P2 — Device registration overrides withdrawn push consent.**

Source: `apps/api/src/modules/profile/routes.ts:306`; `apps/api/src/modules/privacy/routes.ts:84`; `apps/api/src/modules/notifications/service.ts:25`.

Registering a device always upserts consent with `granted: true` and `withdrawnAt: null`. The request contains a token and platform, with no explicit consent decision. A routine token registration after opt-out therefore undoes the user's withdrawal and enables delivery. This directly contradicts the accompanying comment promising not to clobber prior withdrawal. The consent and token writes also occur separately from the withdrawal path, allowing inconsistent results under races.

Evidence: the actual registration handler changed a synthetic withdrawn record back to granted. This is a software behavior finding, not a legal-compliance determination. The current mobile code does not yet integrate native token registration, but the backend endpoint is implemented.

**Status: PENDING — FIX.**

- [ ] **TODO #30:** Keep token registration separate from consent grants; preserve opt-out on refresh/re-registration and test concurrent opt-out/register requests.

**31. P2 — Attendance verification burns codes before check-in commits and ignores attempt counts.**

Source: `apps/api/src/modules/bookings/service.ts:224`.

The code's compare-and-swap consumption commits before the transaction that marks attendance. A transient transaction failure leaves the booking unchanged and the code permanently consumed; retrying the correct code fails. Unlike login OTP verification, this path also never checks the attempt counter before accepting a code. The global request limiter provides some protection, but it is not a per-code ceiling over the code's eight-hour lifetime.

Evidence: a synthetic code with 999 recorded attempts reached the attendance transaction. Injecting transaction failure left it consumed, and a retry returned `CODE_INVALID`. The probe exercised the actual service with Prisma substitutes.

**Status: PENDING — FIX.**

- [ ] **TODO #31:** Consume attendance codes with the state transition in one transaction; enforce the attempt limit and allow retry after rolled-back failures.

**32. P2 — Verification status has no reliable recovery or live update path.**

Source: `apps/mobile/lib/hooks.ts:413`; `apps/mobile/app/(verification)/awaiting-approval.tsx:47`; `apps/api/src/modules/verification/port/dojah-kyc.ts:79`; `apps/api/src/modules/jobs/queues.ts:24`.

The awaiting screen's query has no polling interval or refresh control, despite the onboarding comment saying it polls. The mutation does not invalidate that query, and the screen does not refresh the separate auth-profile state after approval. A screen already mounted on pending data need not update when the webhook changes the database. Separately, the adapter implements `getResult`, but the bounded API-source search found only its interface and implementations, with no service/job invocation. A webhook that is never received therefore has no implemented result-reconciliation path in the inspected code.

Evidence: source/query/schedule inspection. A remount or another query-library refetch trigger may refresh the screen; the finding is the absence of a deliberate completion/recovery mechanism, not a claim that it can never update.

**Status: PENDING — IMPLEMENTATION.**

- [ ] **TODO #32:** Invalidate and refresh verification/profile queries deliberately; reconcile pending provider sessions with bounded retries and an overdue-session queue.

**33. P2 — Staging intentionally exposes login codes and retains message/OTP data in memory.**

Source: `apps/api/src/modules/auth/otp.ts:43`; `apps/api/src/modules/notifications/brevo.ts:15`; `apps/api/src/env.ts:7,91`.

`NODE_ENV=staging` is a supported environment, yet OTP requests return `devCode` for every non-production environment, not just tests. Anyone who can reach such a staging deployment and knows an account's phone number can obtain its login code without controlling that phone. The notification transport's supposedly “test-only” recording array likewise includes staging and retains recipient identifiers and OTP/message summaries without a bound. This is an intentional development shortcut with an overly broad environment condition.

Evidence: explicit source conditions. Production excludes both behaviors. Actual staging reachability, data isolation, and account contents were not verified, so this is conditional exposure rather than a claim of deployed account compromise.

**Status: PENDING — FIX.**

- [ ] **TODO #33:** Limit OTP echoes and intent recording to explicit isolated test mode; verify staging does not return codes or retain an unbounded PII array.

**34. P2 — Scheduled work shares one worker slot without application-level provider deadlines.**

Source: `apps/api/src/modules/jobs/queues.ts:39,45`; `apps/api/src/modules/payments/port/http-paystack.ts:33`; `apps/api/src/modules/notifications/brevo.ts:42`; `apps/api/src/worker.ts:8`.

All scheduled job types share one queue. Worker construction does not override concurrency; the installed BullMQ worker defaults to one. The Paystack adapter supplies no abort/deadline to fetch. A delayed provider call can therefore occupy a worker instance’s sole slot. In a deployment with one worker instance, unrelated attendance, recovery, retention, and reconciliation jobs then wait until the call settles or the transport fails. The deployed worker count was not inspected. Repeat-job registration specifies retention of failed jobs, but no attempts/backoff policy. The worker entrypoint also lacks signal handling to close the worker and drain active work cleanly.

Evidence: source plus the installed BullMQ implementation. No claim is made that HTTP waits forever: transport defaults may eventually fail. The missing guarantee is a bounded application deadline and intentional failure/retry/isolation policy. Retrying money effects must first respect findings 2–6.

**Status: PENDING — FIX.**

- [ ] **TODO #34:** Set provider deadlines, safe retry/backoff, job isolation and shutdown handling; exercise delayed provider responses and worker termination.

**35. P2 — Test sources are excluded from both lint and TypeScript checks.**

Source: `apps/api/tsconfig.json:9`; `packages/shared/tsconfig.json:9`; `packages/config/eslint.config.mjs:15`; `apps/api/vitest.config.ts:8`; `.github/workflows/ci.yml:37`.

API/shared build tsconfigs exclude tests, and the shared ESLint configuration excludes test files and `__tests__` directories. Its comment says tests are validated by “vitest + tsc,” but the configured tsc projects do not include them and Vitest is not configured for typechecking. Passing the current checks therefore does not establish type safety or lint correctness of the money test harness. Runtime assertions still provide useful coverage; this finding concerns the omitted static checks.

Evidence: parsing the actual TypeScript projects produced 51 API source inputs and six shared source inputs, with zero test-file inputs in either. No separate test-typecheck step appears in the inspected scripts/CI configuration.

**Status: PENDING — QUALITY CHECKS.**

- [ ] **TODO #35:** Add a no-emit test tsconfig and applicable lint configuration to CI; establish actual static checking of API/shared tests.

**36. P2 — Retention removes fresh chat and open-dispute conversations based only on event age.**

Source: `apps/api/src/modules/jobs/jobs.ts:153`; `apps/api/src/realtime/messages.ts:10`.

Retention selects conversations solely by the associated event date, then deletes every message. It checks neither individual message age nor whether a dispute remains unresolved. Paid and disputed bookings remain messageable, so a message sent today to an old booking can be removed on the next purge. This can also remove discussion/evidence for an unresolved dispute. It is separate from finding 22: even legitimate, correctly owned media is subject to this premature deletion policy.

Evidence: the media-retention probe supplied a newly created message in an eligible old conversation; deletion was requested without a message-age or dispute-status predicate. The source's four-day safety margin accounts for elapsed event time, not actual dispute resolution. Final retention periods and exceptions require the repository's still-pending policy review.

**Status: PENDING — FIX.**

- [ ] **TODO #36:** Define retention from the appropriate message/dispute milestone and unresolved-case hold; prove fresh messages and held evidence survive the purge.

**Additional engineering observations**

- The money helpers and state tables have meaningful property/transition tests. The current adapter tests cover merchant-note happy paths, but do not exercise ambiguous transfers, asynchronous refund outcomes, recovery crash boundaries, or authenticated KYC callbacks. No dedicated KYC/recovery test file appeared in the inspected test inventory.
- Several service errors (`LedgerError`, `IllegalTransition`, Prisma not-found errors) fall through to generic 500 responses. Missing resources and insufficient funds should have deliberate API errors rather than looking like server failures.
- Events, bookings, conversations, and several admin lists fetch all matching rows. Chat polling fetches the full thread every five seconds. Pagination and incremental chat reads should precede traffic growth.
- Mobile currently polls chat, notifications, and invitations. The inspected mobile code/package manifest has no Socket.IO client or native push-registration integration; backend realtime/FCM plumbing alone does not deliver those features to devices. Admin likewise has no consumer for the emitted reconciliation alarm.
- Reconciliation aggregates multiple tables outside one snapshot, then reads the provider balance. Concurrent settlement can produce transient drift. Its stale-payment filter includes `HELD` but excludes `FROZEN`; disputes can therefore escape that age alarm. Persist and route actionable reconciliation outcomes.
- Notification persistence/delivery and many audit writes occur after business commits. Some failures are silently swallowed; others turn a successful action into an HTTP error. A transactional event/outbox mechanism would make retry semantics clearer.
- The release artifact contains a 5.32 MB Hermes bundle per mobile platform and includes many font weights/icon fonts. That is a measured packaging observation, not evidence of frame-rate problems; profile startup and asset use before optimizing.
- CI appropriately deploys migrations and checks schema drift against an ephemeral Postgres database, but does not run admin/mobile UI tests. Native release builds, store configuration, and deployed service configuration were not verified. Repository Docker startup does not itself apply migrations, so deployment orchestration must supply that step.
- Documentation has drift: admin's shared-package dependency, test timeouts, the claimed dev stubs in `server.ts`, and the README's “refresh denylist pending” statement differ from current code. Comments about crash durability should be rewritten alongside the fixes, since several currently promise more than the implementation guarantees.

**Explicit pendings, unfinished features, and decisions**

This register combines explicit source comments and specification questions with missing integration work found by tracing actual callers. Runtime enum values such as `PENDING_PAYMENT`, input placeholders, and reusable review checklists were not counted as unfinished features merely because they match a keyword.

| ID / status                                        | Pending work and evidence                                                                                                                                                                    | Suggested owner                   | TODO / evidence needed to close                                                                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B1 — PENDING IMPLEMENTATION**                    | Native biometric SDK launch; source explicitly labels account/EAS work pending. See #23.                                                                                                     | Mobile + identity backend         | Complete the SDK/config integration and record successful and cancelled native flows on iOS/Android, with authenticated server results.                                                          |
| **B2 — PENDING INTEGRATION**                       | Mobile push-token registration and Socket.IO consumption are absent from inspected mobile source/manifests. Backend FCM and socket implementations already exist.                            | Mobile + backend                  | Wire token lifecycle, explicit permission/consent, foreground/background delivery, session changes, and reconnect/refetch behavior; verify on devices.                                           |
| **B3 — PENDING EXTERNAL VERIFICATION**             | Brevo WhatsApp sender/template, FCM credentials, Dojah widget/environment and result endpoint are configuration dependencies. Source adapters exist; account configuration was not examined. | Platform + identity/notifications | Record provider test evidence and fail clearly when the required channel is unavailable. Do not count a logged stub as delivered OTP/push.                                                       |
| **B4 — PENDING DECISION + IMPLEMENTATION**         | Processing-fee refund deduction is deliberately disabled; `refundWithFeeDeduction` is explicitly scaffold-only. `packages/shared/src/policy.ts:16` and `money.ts:66`; TRD §23 Q4.            | Product + payments                | Record actual refund-fee policy, implement any retained-fee ledger/reconciliation changes, and align cancellation copy. Toggling the constant alone is insufficient.                             |
| **B5 — PENDING DECISION EVIDENCE**                 | TRD §23 Q1/Q2/Q7 flags the funding/merchant model, Manual Payouts/account constraints and held usher balances as blockers. No resolution was established in the reviewed material.           | Business owner + provider/counsel | Attach the decisions/account enablement evidence and make the implemented wallet/escrow model match them. This report does not determine regulatory permission.                                  |
| **B6 — PENDING PROVIDER CONTRACT EVIDENCE**        | TRD §23 Q3/Q5/Q8 leaves recipient checks, transfer fees/limits, and commission extraction mechanics to confirmation. Code already assumes working recipients/sweeps.                         | Payments + operations             | Verify account-specific behavior, fee treatment and reconciliation, recipient failures, limits, commission transfer reversals, and operational alerts.                                           |
| **B7 — PENDING PRODUCT SETTLEMENT**                | The promised late-cancellation split and 72-hour dispute window are not end-to-end implemented. See #8–9.                                                                                    | Product + payments + operations   | Approve one coherent policy and implement settlement, ledger invariants, admin tools and user-visible outcomes.                                                                                  |
| **B8 — PENDING PRIVACY REVIEW**                    | `documentation/compliance/privacy-and-consent.md` and `ndpr-data-register.md` explicitly await review; the former is an outline “to publish.”                                                | Privacy owner + product           | Record approved retention, unresolved-case holds, processor/data locations, public notice and consent behavior; repair #18/#30/#36.                                                              |
| **B9 — PENDING CONDITIONAL IMPLEMENTATION**        | KYC `nin`/`bvn` writes are explicitly disabled until encryption is wired (`verification/routes.ts:120`). Current callback writes null, not plaintext government IDs.                         | Identity backend + platform       | Decide whether retaining these identifiers is necessary. If required, implement managed encryption and access controls before enabling persistence; otherwise document deliberate non-retention. |
| **B10 — PENDING DEPENDENCY REMEDIATION / RECHECK** | The advisory register dated 2026-06-28 leaves test-tool upgrades unresolved. Installed root Vitest is still 2.1.9. The fresh npm audit failed.                                               | Tooling + security owner          | Refresh the dependency audit, resolve affected tooling with compatible upgrades, run the money tests, and document exposure conditions and residual exceptions with owners.                      |
| **B11 — PENDING OPERATIONS UI**                    | Backend emits `recon:alarm`, but no admin consumer was found; stuck operations and pending refunds lack a complete operator workflow.                                                        | Backend + admin + operations      | Persist alerts/work items, expose provider/ledger state and permitted recovery actions, and verify an alarm reaches an operator.                                                                 |
| **B12 — PENDING DOCUMENTATION RECONCILIATION**     | README still calls the refresh denylist and FCM sender pending; privacy docs say consent records are absent; architecture docs describe the superseded `transferRetry` job.                  | Relevant module owners            | Correct those descriptions against the implemented revoke/FCM/consent/`resumeOps` code, retaining the actual mobile, account, and correctness gaps.                                              |

The dependency register's historical count of six advisories is **not a current count**. A bounded online check confirmed that installed Vitest 2.1.9 remains within the affected range of the recorded UI-server advisory; exposure depends on the described UI/network/Windows conditions. The inspected test scripts use `vitest run`, which does not establish that those exposure conditions are present. [Vitest maintainer advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp).

The installed admin Vite is 6.4.3, which is a patched version for the recorded Windows-path advisory. This does not clear other versions nested under test tooling or other advisories. The relevant maintainer conditions include an exposed development server and affected Windows filesystem behavior. [Vite maintainer advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff).

**Poor practices that allow these defects to recur**

These are maintainability/control weaknesses, not additional P0–P2 findings or proven incidents. Each remains **PENDING**. They explain why isolated patches would leave similar failures likely elsewhere.

| ID       | Practice and concrete consequence                                                                                                                                                                                                                                                                                                       | TODO                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PP1**  | **Comments substitute for enforced invariants.** Examples: optional KYC authentication, durable-operation claims, preservation of consent withdrawal, and partial-field updates contradict their implementations. `holdOrder` also describes allocation conservation without explicitly comparing the sum of bookings with order gross. | Convert essential guarantees into boundary checks and failure/race tests; rewrite comments to describe verified behavior.                                                                                                                    |
| **PP2**  | **External effects are interleaved with transactions without a durable protocol.** A rollback cannot undo a transfer; a later status write can be lost. This pattern spans money, audit/notifications, and object deletion.                                                                                                             | Use persisted intent, explicit uncertain outcomes, idempotent consumers and atomic local finalization. Select retry behavior per effect rather than adding blind retries.                                                                    |
| **PP3**  | **Application composition leaks into domain code.** Services import `ApiError` from `app.ts`; services/recovery mix injected clients with global `prisma`. This makes dependencies cyclic and tests require singleton monkeypatches.                                                                                                    | Move shared errors/contracts below the composition root and pass database/ports consistently through service boundaries.                                                                                                                     |
| **PP4**  | **Response contracts are duplicated and asserted rather than shared or checked.** Mobile `api.get<T>` trusts JSON; admin defines its own shapes and does not import `@hq/shared`. The withdrawal shape mismatch in #15 is an observed consequence.                                                                                      | Publish shared response schemas/types, validate important boundaries, and add contract tests for mobile/admin flows.                                                                                                                         |
| **PP5**  | **Optimistic test doubles conceal provider states.** `InMemoryPaystack` verifies unknown charges as success with amount zero, returns immediate transfer success and permits its balance to go negative. Its refund map provides stronger local deduplication than the HTTP boundary can guarantee.                                     | Keep the simple fake for deterministic ledger tests, but add provider-contract scenarios for pending/unknown/reversed outcomes, insufficient funds, fees, timeouts and replay. Do not treat fake-provider success as provider certification. |
| **PP6**  | **Silent catches and after-commit failures hide outcomes.** Notifications swallow rejections (`notifications/service.ts:62`), storage cleanup ignores errors, and audit writes can fail after a business change committed. Users and operators cannot tell failed work from committed work.                                             | Persist important side effects, expose attempts and errors, and define consistent API responses when ancillary work fails after commit.                                                                                                      |
| **PP7**  | **Unbounded reads and repeated full-history polling.** Message listing loads a whole conversation, mobile polls it every five seconds, several list endpoints fetch all matches, and audit verification traverses history.                                                                                                              | Add cursor/range contracts and limits, incremental synchronization and query/index measurements. Retain correct ordering and authorization across pages.                                                                                     |
| **PP8**  | **Reconciliation is an alarm without a stable operational evidence trail.** Multiple aggregates are outside one database snapshot; the provider is read afterward. Stale-escrow checks exclude `FROZEN`, and admin does not consume the alarm.                                                                                          | Define reconciliation cutoffs/in-flight adjustments, include aged disputes, persist runs and investigations, and test that genuine drift produces an actionable work item.                                                                   |
| **PP9**  | **OTP hashing assumes rate limits protect stored hashes.** `auth/hash.ts:18` hashes only the six-digit code with SHA-256. Someone who obtains the stored hashes can enumerate the one-million-code space offline; HTTP limits do not constrain that attack.                                                                             | Use a keyed, purpose/subject-bound verifier with a managed secret, short expiry and attempt limits; keep this risk distinct from ordinary online guessing.                                                                                   |
| **PP10** | **Storage keys are treated as proof of upload.** Photo/KYC checks use prefix matching; they do not prove the server issued the key or verify object existence, content, size or purpose. A photo key can be referenced multiple times; deleting one reference can break another. Avatar deletion precedes the database update.          | Track upload ownership/purpose and finalization, enforce upload bounds, and delete objects only through durable cleanup after references are safely updated.                                                                                 |
| **PP11** | **Per-transaction money limits do not bound accumulated balances.** Wallet and ledger `balanceAfter` remain database `Int`; `appendWallet` guards negative balances but not aggregate overflow. Repeated valid credits can exceed the representable balance.                                                                            | Establish an explicit balance ceiling with operational handling, or migrate aggregate integer storage and API serialization coherently; test boundary accumulation. Keep integer kobo throughout.                                            |
| **PP12** | **Frontend success paths receive much more assurance than lifecycle failures.** Mobile/admin have no test files in the tracked inventory; JS export does not exercise permission prompts, backgrounding, secure storage, deep links, native KYC or checker decisions.                                                                   | Maintain focused tests for auth expiry, checkout return/resume, KYC, consent, cancellation and withdrawals, plus native smoke coverage. Profile startup before treating bundle size as a performance diagnosis.                              |

**Pending validation checklist**

- [ ] **V1 — Database:** Run migrations, drift check and the complete serial DB suite against isolated Postgres, including simultaneous refund/release, refresh reuse, consent changes and crash recovery. **Partially complete:** migration/drift and targeted payment/approval races and crash recovery passed on 12 September; the full suite and remaining concurrency scopes are still pending.
- [ ] **V2 — Providers:** Exercise the full charge → hold → release → withdrawal/refund/sweep lifecycle using test accounts, signed webhooks, delayed final states, duplicate callbacks and lost responses. Verify fee/balance reconciliation against the actual account contract.
- [ ] **V3 — Native mobile:** Test SDK launch, identity result, checkout return after process restart, offline startup, logout during refresh, push consent/token lifecycle and background notifications on iOS/Android.
- [ ] **V4 — Admin:** Interact with approval evidence and competing checker actions, expiry/renewal, failed refunds and reconciliation alerts. Static source review is not a completed usability audit.
- [ ] **V5 — Infrastructure/storage:** Verify worker TLS/database selection, isolated Redis failure behavior, deployment migration orchestration, shutdown/recovery and storage ownership/deletion retries with disposable infrastructure.
- [ ] **V6 — Dependencies:** Re-run a current audit when registry access is available; distinguish runtime, build, development-server and test-tool exposure. Do not reuse the June advisory count as today's result.
- [ ] **V7 — Policy/account evidence:** Attach resolutions for B4–B9 and make the shared rules, operations tools and UI agree. Confirmations outside the repository remain unverified here.

**Initial examination validation — 11 September**

| Check                                               | Result                                                  | What it establishes                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run typecheck --force`             | Passed, 7 tasks, 0 Turbo cache hits                     | Workspace typecheck scripts completed; referenced `tsc -b` retains its normal incremental behavior                                                                                                                               |
| `pnpm exec turbo run lint --force`                  | Passed, 5 tasks, 0 cache hits                           | Current lint rules passed                                                                                                                                                                                                        |
| `EXPO_OFFLINE=1 pnpm exec turbo run build --force`  | Passed, 5 tasks                                         | Backend/shared/database builds, admin Vite build, iOS and Android JS exports                                                                                                                                                     |
| Prisma schema validation with dummy connection URLs | Passed                                                  | Schema syntax/relations validate; does not establish migration equivalence                                                                                                                                                       |
| Shared Vitest suite                                 | 32 passed, 4 files                                      | Existing money, DTO, policy, transition tests                                                                                                                                                                                    |
| HTTP refund-adapter Vitest suite                    | 2 passed, 1 file                                        | Existing mocked merchant-note lookup/create behavior                                                                                                                                                                             |
| Initial eight focused local probes                  | Defects reproduced                                      | Unsigned KYC, uncertain transfer classification, operation rollback, repeated sweep recording, PATCH invariants, refund-before-validation, audit truncation, concurrent refresh reuse                                            |
| Deeper-pass control-flow probes                     | Nine additional scenarios reproduced                    | Foreign media deletion request; recovery starvation; Redis parsing; mobile refresh race; preference loss; declined-but-accepted invitation; consent reversal; consumed attendance code after failure; partial batch confirmation |
| Test-project input inspection                       | Confirmed static-check gap                              | API/shared tsc projects include zero test files; lint also excludes them                                                                                                                                                         |
| `pnpm audit --json`                                 | **INCOMPLETE — npm registry DNS failure (`ENOTFOUND`)** | No current vulnerability count or clean result can be inferred                                                                                                                                                                   |

The initial deeper pass added targeted probes and source/configuration inspection without implementation changes. Probe substitutes were isolated to their Node processes. The 12 September follow-up adds maintained regressions and repeat validation described above.

The admin bundle was approximately 179 kB JavaScript before gzip / 58 kB gzip. Both mobile JavaScript exports succeeded; these were not native iOS/Android binary builds.

At the initial review, database integration, migration/drift, and real PostgreSQL race tests had not run. The 12 September follow-up supersedes that limitation for the selected payment/approval/booking scopes using a temporary schema on the live database. The complete API suite, external storage/provider integration, native flows, and deployed application behavior remain unverified.

**Recommended execution order**

1. **Identity and storage authorization:** close #1 and #22; prevent forged KYC acceptance and foreign-object deletion, with regression coverage.
2. **Money correctness and recovery:** #2–5 implemented with database regression evidence; finish #6 and #24 and complete provider-account validation. Do not add automatic retries before the protocol is safe.
3. **Core product delivery:** complete native KYC and status recovery (#23/#32), repair checkout and event invariants (#7/#13), and resolve dispute/cancellation/fee decisions (#8/#9, B4–B7).
4. **Session, consent and data correctness:** address mobile refresh/logout, socket revocation, venue serialization, attendance consumption, audit anchoring, retention and consent preservation.
5. **Operational reliability and quality controls:** repair Redis/worker configuration, expose reconciliation and blocked operations to admin, add test-source static checks and the missing contracts/workflow coverage.
6. **Release evidence:** complete V1–V7 and record owners/results for every remaining pending item. Passing builds and isolated probes do not substitute for these checks.
