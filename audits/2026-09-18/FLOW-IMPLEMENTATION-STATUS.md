# Flow implementation status

19 September 2026 · Implementation after the flow audit · Calm, trustworthy direction retained

This is an implementation checkpoint, not a claim that the entire audit backlog or native acceptance plan is complete. Changes are in the working tree; nothing has been deployed or committed by this task. The earlier flow audit describes the baseline and remains unchanged as historical evidence.

## Before / after

| Journey | Before | Implemented behavior |
|---|---|---|
| Invite staff | The profile action sent no invitation | Eligible event picker, real invitation submission, client sent-invitation list and usher inbox |
| Applications and staffing | Accepted could read as funded; withdrawn state unsafe; total headcount used for selection | Selection versus funding distinguished, withdrawn rendered safely, remaining capacity enforced in the UI, confirmed/reserved/available totals provided by the API |
| Booking return | No complete active/past hub or durable usher booking detail | Shared active/history list and role-aware detail, linked from home, jobs, calendar, profile and notifications |
| Attendance | Self-arrival API had no mobile entry or client-visible claim | Arrival action, client roster timestamp, check-in/completion and problem-report links; idempotent arrival under lifecycle locks |
| Cancellation | Device-timezone disagreement, client-only wording, misleading fee copy and pending failure | Shared Lagos event instant, server quote, role-specific outcome, no invented fee deduction, pending refund leads to the durable booking record |
| Dispute follow-up | Isolated submission form; evidence absent from admin case | Reachable report action, participant case status/reason/note/outcome in booking detail, shared booking conversation/photos as evidence, authorized evidence in admin case |
| Reviews | Generic client-only form and no reliable completion state | Correct named counterparty for both roles, paid-booking eligibility and persisted caller review |
| Withdrawals | Initial receipt without lasting history/status | Owned paginated history, detail polling for pending requests, masked bank reference, return links from wallet and receipt |
| Admin approvals | Pending queue only; checker rejection stranded disputes | Processing/executed/rejected history; rejection safely reopens eligible cases for a revised proposal; duplicate proposals guarded |
| Admin refunds | Creation API without operator entry | Searchable booking cases, payment/refund/approval context, guarded full refund request, uncertain outcomes require refreshing the case |
| Account and privacy | Inert settings rows and unreachable privacy APIs | Client editing, preferences, policy read/acknowledgement, data export, guarded account erasure and support links |
| Onboarding and verification | Incomplete setup could be bypassed; language choices lost | Durable setup checks at index and role layouts, persisted languages, pending verification return/refresh, restricted-account support state |
| Chat return | No image send or read indication; terminal histories hard to reach | Photo upload, read receipts, unread conversation counts, retained read-only terminal history, participant-only archived media access |
| Cross-screen updates | Local actions could leave other screens stale | Booking mutations invalidate related reads; active statuses poll; polling pauses when the native app is in the background |

## New destinations

Mobile: My bookings, Booking details, Invite staff, Invitations, Withdrawal history, Withdrawal details, Account settings, Privacy & data, and public Privacy policy. Existing attendance, cancellation, dispute, review and messaging screens were extended rather than duplicated.

Admin: Bookings & refunds. Approval history remains in the existing Approvals destination. Ledger entries link directly to booking cases. Case opening and closing use the existing focus-management component.

## Policy and evidence boundaries

- No new split-refund settlement or post-payout dispute mechanism was added. Current restrictions are explained and routed to support; the UI does not claim that support has already moved money.
- Participant dispute evidence uses the shared booking conversation. Both parties can see it, and the copy says so. A separate private case evidence/timeline model remains unimplemented.
- Financial mutations still use existing ledger/provider orchestration and maker/checker rules. No schema migration is introduced by these changes.
- No real payment, refund, account erasure, document decision, external message or production action was performed during verification.

## Validation

- Workspace typecheck and lint passed during implementation; final checks recorded below.
- Shared tests: 40 passed, including eight new Lagos boundary/staffing cases.
- Focused API unit tests: 70 passed across booking flow reads (7), mobile session lifecycle (23), admin reads (5), owned withdrawal history (4), and chat media authorization (31).
- iOS and Android Expo export succeeded, approximately 5.43 MB per platform. This verifies bundling, not runtime UX or installability on a device.
- Local admin browser interactions used the real frontend with a synthetic fixture API. Approved/processing and rejected approval cases were inspected; booking search and case opening were exercised. The new case view was checked at desktop and 375×812. Focus enters the case on open and returns to its trigger on close. A disputed/frozen case correctly offers no fresh refund action. This fixture is not a payment integration test. See [interaction evidence](evidence/implementation-browser-checks.md).
- Database checks use the repository's isolated-schema runner, direct-connection isolation checks, tracked migrations and drift guard. Provider keys are disabled/stubbed. Results and cleanup are recorded in the final validation section below.
- Native walkthrough remains unrun: `xcrun simctl` is unavailable in the current developer-tool installation. Background delivery, media permission handling, share-sheet export, and true device return/deep-link behavior still require device testing.

## Remaining audit work

| Scope | Status / next concrete work |
|---|---|
| Whole-event cancellation | Missing coordinated preview, per-booking settlement/outcome and durable partial-failure recovery. Individual booking cancellation is implemented. |
| Recruitment management | Close recruitment, safe headcount changes and event duplication remain. Requires an explicit lifecycle contract; do not repurpose CANCELLED as a recruitment toggle. |
| Late cancellation / post-payout disputes | Existing backend restrictions preserved. Requires policy and settlement implementation before expanding the promise. |
| Case-specific evidence | Shared conversation works; dedicated case timeline/private evidence and separate response workflow remain. |
| Background notifications | Mobile SDK permission/device registration, token lifecycle and actual delivery/cold-start tests remain. Saving consent alone does not enable delivery. |
| Notification catalogue | Booking/withdrawal navigation targets are supported, but remaining lifecycle emitters and catalogue coverage are not complete. |
| Voice messages | Backend storage supports voice; mobile recording and playback remain. Current photo support does not satisfy the full media requirement. |
| Admin money exceptions | General booking/refund investigation exists; exception queues and reconciliation freshness remain. |
| Admin verification / account / event investigation | Decision history, structured rejection reasons, expanded account case and event roster tools remain. |
| Rewards / reports / categories | Operator reward fulfilment queue/history remains; minimum reports/categories launch scope still needs definition. |
| Discovery and reliability | Date/budget narrowing, coarse location/client reputation presentation and incident-level reliability explanation remain. |
| Acceptance | The original 15 native/end-to-end acceptance journeys remain a release checklist, not a passed certificate. |

## Final validation

- Final workspace typecheck and lint passed. Admin production build and iOS/Android exports passed. Diff whitespace checks passed.
- Isolated database suites passed: recruitment lifecycle (15), full booking lifecycle (3), venue privacy (9), and authorized media/retention (10). The media suite also checks unread counts before and after marking a message seen.
- Maker/checker and refund-preflight suite: 4 passed, including concurrent proposal deduplication without moving funds. Across the affected database suites, all 41 distinct cases passed after the corrected media rerun.
- The first media run correctly exposed an obsolete test expectation for archived downloads; the second exposed an unsupported assertion helper in the test itself. Both were corrected, and all 10 media cases passed on the final rerun. No failure was suppressed.
- Migration deployment, drift checks, direct connection isolation and automatic schema removal passed for the completed database runs. No production records or real provider transactions were used.
- Graph coverage checked all 65 changed/new TypeScript paths against generation `2026-09-19T15:33:09Z`. The sole recorded parse gap, dispute.tsx line 96, was read directly. Coverage is a best-effort discovery aid, not a test certificate.

Final result: 40 shared + 70 focused unit + 41 affected database cases passed across the scoped runs (151 distinct tests). This is not a full repository test-suite or native acceptance certification. All disposable schemas were removed and the temporary preview servers were stopped.
