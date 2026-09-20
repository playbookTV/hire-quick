# PRD to codebase alignment — 18 September 2026

The code implements substantial booking, payment, verification, and administration foundations, but it does not yet deliver the full PRD v2.1 launch experience. The largest differences are late cancellation settlement, post-release disputes, and backend features that have no usable mobile entry point.

Reviewed revision: `8fa28a463ec620a00161c61d92f018d1734e155a` on `feat/client-feedback-round1`. The working tree was clean when the review began. Baseline: [PRD v2.1](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md). This report adds review evidence; it does not change the PRD or application behavior.

## Evidence and interpretation

- **Present** means the inspected source implements the named behavior. It does not mean production acceptance has passed.
- **Partial** means some required behavior exists, but a rule, screen, or operational step is missing.
- **Different** means source deliberately implements a different contract from the PRD.
- **Not found** is bounded to the inspected API routes/services and mobile/admin source, with graph discovery followed by source searches. It is not a claim about external operations or unpublished branches.
- **Unverified** means this review did not establish runtime or deployment evidence.

This was a source review using the graph at Verify tier, exact source reads, and relevant call traces. The coverage check reported generation `2026-09-18T18:29:43Z`, with matching filesystem metadata for the evidence files. The parser gap at mobile `dispute.tsx:68` was read directly, as were the reported test-source gaps in the queried auth/events scopes. All relevant graph search pages were complete. Coverage remains a best-effort signal.

Validation performed: `pnpm --filter @hq/shared test` — **4 files, 32 tests passed** (money, policy, state machines, DTOs). Database integration tests, live Paystack/notification delivery, device interaction, accessibility, load, and uptime testing were not run. Existing tests or comments are not treated as proof that a whole PRD journey works.

## Requirement matrix

| PRD requirement | Assessment | Current source behavior and evidence |
| --- | --- | --- |
| §8/9 Phone signup, OTP, role selection, sessions | Present for OTP; different recovery contract | OTP expiry, failed-attempt limits, resend limits, account creation and token issuance exist. Routes expose OTP request/verify, refresh and logout. Password set/reset and recovery that invalidates all other devices were not found in this auth surface. [OTP](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/auth/otp.ts:24), [routes](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/auth/routes.ts:24). |
| §8 Profile and identity verification | Core flow present | ID/selfie submission creates a pending review; admin decisions update verification status and record rejection reasons. Discovery and hiring enforce verification gates. [Submission/review](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/verification/service.ts:85), [eligibility](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/eligibility.ts:19). |
| §8 Multi-staff event creation | Core creation present; notifications partial | Creation persists headcount, per-head budget, date, start/end time, dress code and preferences, and publishes OPEN. The creation handler does not notify matching ushers. [Creation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:70). |
| §9 Edit/cancel event | Partial | Editing is restricted to OPEN/PARTIALLY_STAFFED events with zero booking records. Per-booking cancellation exists; an event-wide cancellation operation was not found in the events router. [Edit guard](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/edit.ts:43), [events router](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:66). |
| §8 Browse verified staff with availability/location/rating/price filters | Core filters present | Server supports all four filters and ranks by completed jobs then rating. Availability filtering requires an explicit AVAILABLE calendar row; booking eligibility additionally checks schedule conflicts. Saving favourite staff was not found; saved jobs for ushers are a separate implemented feature. [Discovery](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/ushers/routes.ts:39), [saved jobs](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:228). |
| §8 Apply, shortlist, accept, reject, withdraw | Partial | Apply and client selection exist with availability/overlap checks. WITHDRAWN is set when declining an invitation, but a separate usher application-withdrawal route was not found. [Recruitment](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:21), [selection routes](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:301). |
| §7/8 Direct invitations and reservation on acceptance | Partial; reservation timing differs | API can invite and accept/decline. Mobile can respond to invitations, but the client Invite action only displays a toast and navigates back. Acceptance creates an ACCEPTED application; bookings/reservations are created later during checkout. [Invite button](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/staff-profile.tsx:133), [acceptance](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:80), [checkout creation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:114). |
| §8/12 Confirm a batch, charge once, allocate per booking | Present in inspected service path | Confirmation locks selections and schedules, checks capacity, creates an order and pending bookings, and resumes checkout. Confirmed charge creates per-booking HOLD/payment allocations. [Confirmation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:80), [allocation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:214). |
| §12 Wallet release, bank withdrawal, 15% fee, commission sweep | Present in inspected service path | Release credits the wallet and records commission; withdrawal debits the wallet and creates a provider operation; failed transfers can restore the balance. Sweep and reconciliation jobs are registered. External activation/approval remains unverified. [Release](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:297), [withdrawal](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/service.ts:312), [jobs](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/jobs/queues.ts:25). |
| §8 Messaging: text, images, voice notes, contact notice | Partial | API supports content types and owned media references; mobile sends strings and renders message content as text. Phone/email/platform-name detection exists, but generic URLs are not covered by the patterns. Flagged content is not masked despite UI copy saying it is hidden. [Message service](/Users/leslieisah/app-dev/hire-quick/apps/api/src/realtime/messages.ts:14), [mobile hook](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/hooks.ts:154), [thread display](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/message-thread.tsx:216). |
| §8 Attendance via code or QR | OTP present; timing gap | Booking-bound, expiring OTP verification exists and mobile exposes code entry. QR is not exposed in the inspected attendance flow; the PRD permits OTP as the alternative. Arrival/check-in/manual completion do not enforce the event-day/end-time rules described in the PRD. [Attendance service](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:151). |
| §8 Passive-client payout protection | Backend present; mobile incomplete | Arrival endpoint and end + 60-minute auto-complete exist. Mobile has no call to the arrival endpoint and its check-in screen requires the host's code. [Arrival endpoint](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/routes.ts:106), [auto-complete](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:246), [mobile check-in](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/check-in.tsx:99). |
| §8/11 Two-way reviews and reliability | Backend present; mobile partial | Either party can review a PAID booking; client and usher aggregates update. The discovered rating entry point is the client's event-day roster, and the rating screen is staff-oriented. An usher-facing rate-client entry point was not found. Reliability penalties exist for no-show and cancellation. [Reviews](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:391), [rating entry](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:306). |
| §13 Client cancellation matrix | Partial; late windows blocked | More than 48 hours can execute a full refund. The 12–48h and less-than-12h policies exist as data but execution returns PARTIAL_CANCEL_UNSUPPORTED. Mobile redirects to support. [Policy](/Users/leslieisah/app-dev/hire-quick/packages/shared/src/policy.ts:48), [execution](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:447). |
| §13 Usher cancellation/no-show | Backend present; usher cancellation UI incomplete | Usher cancellation performs full client refund and reputation effects; no-show sweep excludes asserted/verified arrivals. No usher cancellation entry point was found in the inspected mobile journey, and the shared cancellation screen hardcodes CLIENT policy. [Usher cancellation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:490), [no-show](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:305), [UI policy](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:73). |
| §8/13 Disputes within 72h, evidence, resolution | Partial; material contract difference | Deadline is 72h after event end, but only HELD funds can be disputed. Ushers additionally need checkedInAt, so self-asserted arrival alone does not qualify. Reason/note submission and admin resolution exist; evidence submission and the full automatic chat/photo evidence workflow were not found in the inspected case surface. [Dispute opening](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:341), [admin context](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:193). |
| §9/13 Admin verification, suspensions, refunds, approvals, categories, reporting | Partial | Verification, user suspension, disputes, approvals, ledger and counters have surfaces. Direct refund API exists but no general refund-creation UI was found. Categories/configurable policy management were not found. Approval threshold is a source constant of ₦50,000. [Admin routes](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:47), [UI routes](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/App.tsx:16), [threshold](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:22). |
| §10/16 Notification catalogue, push, Resend email | Partial; provider differs | Application/invitation received, booking confirmed, payout released and dispute-opened notifications exist, plus chat/reward delivery. Other catalogue events are not all wired to persisted/email/push notifications. FCM server transport exists; mobile token/permission registration was not found. Email uses Brevo, not Resend. [Catalogue implemented](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/service.ts:71), [email](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/brevo.ts:77), [FCM](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/brevo.ts:183). |
| §14 Performance, uptime, scale, accessibility, security | Unverified acceptance; security foundations present | Source has production CORS/rate-limit guards, Helmet, authorization boundaries and generic unexpected-error responses. This review establishes none of the numerical performance, concurrency, uptime, or WCAG targets. [Application setup](/Users/leslieisah/app-dev/hire-quick/apps/api/src/app.ts:69). |

## Priority findings and closure criteria

### A1 — P1 — Late cancellation cannot deliver the advertised compensation

PRD §13 promises 50/50 settlement at 12–48h and 100% usher compensation below 12h. The service rejects both. The mobile support message says the team settles the split manually, but the inspected admin refund service only accepts a full booking refund and dispute resolution offers RELEASE or REFUND, not a split.

This distinction matters: refunding one whole booking within a multi-booking charge is supported; partially refunding a single booking and paying its remainder is not. Do not count partial-order refunds as implementation of the cancellation matrix.

Close with an explicit commission rule for compensation, an atomic per-booking split settlement, matching admin/mobile actions, and integration tests for both late windows. Evidence: [client guard](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:462), [full-only ledger](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:439), [admin refund](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:108).

### A2 — P1 — The effective dispute window ends at payout

The 72-hour deadline check does not preserve a 72-hour right to dispute. Once release changes escrow to RELEASED and booking to PAID, freezeBooking rejects the dispute, even if the usher has not withdrawn. Auto-completion makes this possible shortly after event end. This is a deliberate money-safety restriction, not an absent deadline check.

Close by choosing and implementing a consistent release/withdrawal/dispute policy, including post-release recovery if immediate availability is retained. Also explicitly decide whether an usher who only self-asserted arrival can dispute. Evidence: [deadline and usher gate](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:357), [escrow guard](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:484), [terminal states](/Users/leslieisah/app-dev/hire-quick/packages/shared/src/state-machines.ts:23).

### A3 — P1 — Passive-client protection is unreachable through mobile

The backend can protect an usher who independently records arrival. The mobile screen only offers entering the client's six-digit code. A host who is unavailable therefore still prevents the user from recording the signal that protects them against the no-show sweep.

Close with an accessible “I've arrived” action that calls the existing endpoint, shows its recorded state, and explains the dispute/auto-completion policy. Verify the complete passive-client scenario through the mobile flow, not only a service test. Evidence: [mobile check-in](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/check-in.tsx:99), [backend arrival](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:213).

### A4 — P1 — Direct hiring stops at the Invite button

The staff profile's Invite handler shows “Open one of your events to invite this usher” and navigates back. Source search found no mobile request to the invitation-creation endpoint. The client event actions expose application review, event day, messaging and cancellation, but not an invitation composer. Receiving/responding to an existing invitation is implemented.

Close with event selection and invitation submission from the staff profile or event roster, retaining the chosen usher and showing confirmation/errors. Decide whether acceptance reserves capacity: currently it only creates an accepted application, while pending bookings are created at checkout. Evidence: [Invite handler](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/staff-profile.tsx:133), [server creation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:314), [acceptance semantics](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:92).

### A5 — P1 — Dispute evidence is not available as promised

Mobile says “Chat & attendance logs attached automatically” and accepts only reason/note. The admin case endpoint and component show attendance timestamps and dispute notes, but do not return/render the booking conversation or submitted evidence photos. Ordinary chat access is party-only. Existing stored chat does not constitute a usable evidence review workflow for admins.

Close with party evidence upload/submission, an authorized admin evidence read path, conversation/media display, and clear user-visible case status. Define the resolution SLA separately from the dispute-opening window; mobile currently says review is “usually within 72 hours.” Evidence: [mobile claim](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/dispute.tsx:53), [case response](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:198), [case UI](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/BookingReview.tsx:38).

### A6 — P1 — Attendance and manual release lack event timing guards

assertArrival checks ownership and status, but does not load the event or validate its time. generateCheckin/verifyCheckin likewise do not enforce an event-day window. completeBooking requires CHECKED_IN but does not require event end before releasing earnings. Consequently, the inspected service path permits advance arrival assertion and early completion, contrary to the PRD's on-site/day-of and event-completion sequence. The automatic completion path does enforce end + grace.

Close by defining allowed early/late check-in windows, whether manual completion may end an event early, and enforcing those decisions server-side. Include tests for future events and the no-show cutoff. Evidence: [attendance functions](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:151), [arrival/manual completion](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:213).

### A7 — P2 — Cancellation copy contradicts the processing-fee gate

The cancellation screen unconditionally labels processing fees “Non-refundable.” The shared flag is false and the ledger explicitly leaves fee deduction inactive. PRD §13 says not to ship that copy before the provider decision.

Close by making displayed amounts and fee wording reflect the effective settlement policy. Evidence: [UI copy](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:125), [disabled flag](/Users/leslieisah/app-dev/hire-quick/packages/shared/src/policy.ts:17), [ledger integration boundary](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/ledger.ts:453).

### A8 — P2 — Notification transport does not equal the required lifecycle catalogue

Server FCM/email support is real source implementation, but the mobile app has no discovered OS permission/token registration path. Some lifecycle changes only emit realtime events; those are not email/push/inbox notifications. For example, invitation response and verification approval/rejection do not call the lifecycle notification helpers. Event creation does not notify matching ushers. Scheduled jobs contain no attendance/review reminder jobs.

Close with a recipient/channel/trigger matrix for every §10 event, native push registration and consent, and delivery tests. Document Brevo as the chosen email provider if that change is intended. Evidence: [notification helpers](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/service.ts:71), [verification decisions](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:122), [scheduled jobs](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/jobs/queues.ts:25), [mobile dependencies](/Users/leslieisah/app-dev/hire-quick/apps/mobile/package.json:17).

### A9 — P2 — Remaining user and ops journeys need explicit completion

The inspected mobile flow lacks image/voice messaging, a rate-client entry point, an usher-oriented cancellation flow, and a whole-event cancellation flow. The admin console lacks a general refund-creation page and category management. Password recovery and configurable cancellation percentages/approval threshold do not match the written requirements. These are separate deliverables; working APIs or constants should not mark them complete.

For messaging specifically, the UI states “Contact details are hidden,” but it renders the original content and the backend only flags it. Implement actual masking if §15's stronger mitigation is intended, or correct the claim; add generic URL handling to satisfy §8. Evidence: [thread rendering](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/message-thread.tsx:216), [contact patterns](/Users/leslieisah/app-dev/hire-quick/apps/api/src/realtime/messages.ts:14).

## Where the PRD should catch up with source

These differences should be documented explicitly rather than silently treated as fulfilled requirements:

1. **Authentication:** decide whether OTP-only access replaces passwords and define the intended recovery/session-revocation behavior.
2. **Recruitment:** acceptance currently means an accepted application, not a booking or capacity reservation. Pending bookings begin at confirm-and-pay. Checkout has a 30-minute deadline, recovery states and late-payment refund handling that deserve acceptance criteria. [Checkout](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/checkout.ts:13).
3. **Event editing:** the code locks edits once any booking record exists. Specify whether this is the intended policy, including expired/cancelled reservations. [Guard](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/edit.ts:49).
4. **Payment semantics:** source credits the wallet on release and transfers at withdrawal. Reconciliation tracks provider balance using holds, refunds, sweeps and paid withdrawals; it does not simply compare unfinished bookings to the entire balance. Align PRD §12 with this distinction. [Reconciliation](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/ledger/reconciliation.ts:21).
5. **Operational policy:** cancellation percentages, the 60-minute grace default and the ₦50,000 approval threshold are code values, not ops-editable settings. Specify configuration ownership and change rules if runtime adjustment remains required.
6. **Scope:** saved jobs and milestone reward administration already exist; saved favourite staff does not become implemented merely because saved jobs do. Keep the V1/V1.5 distinction explicit. [Saved jobs](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:228), [reward administration](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:357).

## Recommended order

1. Resolve and implement the cancellation/dispute financial contracts (A1–A2).
2. Finish the mobile paths for independent arrival and direct invitations, with server timing guards (A3–A4, A6).
3. Complete dispute evidence and admin handling (A5).
4. Correct fee/contact copy and complete notifications, messaging, reviews and cancellation entry points (A7–A9).
5. Update the PRD with requirement IDs and separate API, mobile, admin and acceptance-evidence status. Keep performance, provider and deployment gates unverified until supported by fresh evidence.

No completion percentage is assigned: counting endpoints would overstate readiness while several of the core trust promises remain unavailable to users.
