# Client journey completeness audit — 18 September 2026

Source-verified review; no native app session, API mutation, payment, or live account interaction was performed. “Reproduce” below describes a reachable state inferred from current source, not a recorded live run. Application code was not changed. This review covers client event creation/management, discovery/invitation, applications, checkout/recovery, attendance, cancellation, disputes, and reviews. Shared account, notification, and messaging findings belong to the main audit.

## Assessment

The ordinary create → receive applications → select → pay → attendance → release path is substantially implemented. The larger gaps occur when clients must recruit proactively, change plans, recover staffing, challenge attendance, or follow a financial case. Several required actions are absent even though their screens or backend pieces exist. Checkout recovery is a notable strength and must be retained.

Priority meanings: P1 = prevents an important V1 journey or misrepresents a money/attendance decision; P2 = meaningful missing management or follow-up capability. No P0 is claimed from static evidence.

## Journey map

| Journey | Present | Missing or incomplete |
| --- | --- | --- |
| Create event | Three steps, field validation, cost review, API publish, success route | Date picker offers only tomorrow through 60 days; no documented policy explaining this |
| Edit/manage | Edit before any booking record exists; event/application entry points | Whole-event cancellation, recruitment closure, slots after booking, duplicate; reopening capacity is displayed incorrectly |
| Browse/invite | Search/filter/profile; backend invitation create and usher response | Client invite selection/submit and sent-invitation tracking |
| Applications | Shortlist/reject, select multiple, batch checkout | Accurate remaining capacity, withdrawn/booked states, durable accepted basket before checkout |
| Pay/recover | Persisted checkout key/input/outcome; original checkout resume; authoritative status; uncertainty states | Operator handoff from REVIEW is copy-only; no direct support action (P2 detail below) |
| Event day | Named expiring per-person code, check-in status, explicit release confirmation, refresh errors | Self-arrival visibility and report-problem entry |
| Cancel/refund | Full-refund preview and cancellation; late-window support link | Correct Lagos time conversion, pending-refund case/status, operational split settlement |
| Dispute | Reason/note form and authenticated freeze API | Reachable entry, photo evidence, case detail/status/outcome, counterparty response |
| Review | One review POST per paid booking, rating/comment | Named multi-person review queue and reviewed state |

## Findings

### C01 — P1: “Invite to an event” never sends an invitation

**Type:** Missing action and event picker; backend capability exists. **Requirement:** PRD §8 Discovery & Hiring; UXRD §§6.4–6.5, §8.

**Reproduce:** Client Home → Browse staff → profile → Invite. The handler only displays “Open one of your events to invite this usher” and goes back. Opening an event does not offer Invite either. A client with no applications consequently cannot use the specified proactive hiring route.

**Evidence:** [apps/mobile/app/(modals)/staff-profile.tsx:133](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/staff-profile.tsx:133); event action inventory [apps/mobile/app/(client)/events/[id].tsx:197](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:197); actual invite POST [apps/api/src/modules/events/routes.ts:314](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:314) and guarded implementation [apps/api/src/modules/events/recruitment.ts:62](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:62). Mobile route/lib literal scan found no invite POST call. Empty applications has no Browse Staff action: [apps/mobile/app/(modals)/applications.tsx:250](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:250).

**Acceptance:** Invite opens a list of eligible client events, retains the chosen usher when creating a new event, submits the existing endpoint, shows pending/duplicate/ineligible outcomes, and returns to that event. No-applications state offers an event-scoped browse action.

### C02 — P2: Clients cannot follow sent invitations or distinguish their outcomes

**Type:** Missing client tracking screen/data contract. **Requirement:** PRD §8 invitation acceptance/decline; UXRD §§6.6–6.7.

**Reproduce:** An invitation is created through the API and the usher accepts or declines. The only invitation list and detail routes are usher-owned; accepted replies create an ACCEPTED application, declined replies create no actionable client invitation history. The client event screen shows only an undifferentiated applications count.

**Evidence:** [apps/api/src/modules/events/routes.ts:335](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:335); [apps/api/src/modules/events/recruitment.ts:80](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:80); [apps/mobile/app/(client)/events/[id].tsx:197](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:197).

**Acceptance:** Event staffing shows Sent, Accepted/pending payment, Declined and closed invitations with named staff. An accepted invite goes directly into the appropriate payment selection; declined/closed invites have a clear next step. Server authorizes this list to the owning client. This is a dependency of C01 completion, not a request for future favorite staff.

### C03 — P1: Whole-event cancellation has no path, including events with no bookings

**Type:** Missing management action and backend lifecycle workflow. **Requirement:** UXRD §6.6, PRD §9.

**Reproduce:** Publish an event, then decide to cancel it. With zero bookings there is no cancellation action. With one booking there is Cancel booking; with several there is a detour through the roster to cancel one at a time. None is a whole-event confirmation with each person's outcome. Per-booking refunds do not express the client's intention to close the event: staffing recalculation can return the event to OPEN.

**Evidence:** [apps/mobile/app/(client)/events/[id].tsx:205](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:205); event router operation inventory [apps/api/src/modules/events/routes.ts:66](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:66); edit allowlist [apps/api/src/modules/events/edit.ts:19](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/edit.ts:19); staffing state derivation [apps/api/src/modules/events/staffing.ts:16](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/staffing.ts:16). No cancel-event mutation exists in the bounded events router/recruitment/edit scope.

**Acceptance:** Cancellation works for empty, unpaid, partly staffed, and fully staffed events. Before execution show every affected booking, refund/compensation and unsupported cases; close recruitment durably; expose partial/pending outcomes instead of declaring the whole operation finished. Preserve existing idempotency and money invariants.

### C04 — P2: Recruitment cannot be closed or slots managed after booking; duplicate is also missing

**Type:** Missing actions with backend restrictions. **Requirement:** UXRD §6.6; partial-fill recovery §9.

**Reproduce:** Pay for four of six staff, then choose to stop accepting applications or increase/decrease remaining slots. Edit disappears after any booking row exists and the API rejects editing. There is no dedicated close-recruitment or slot-management operation. A refunded or expired historical booking also leaves general editing locked. No Duplicate action initializes a new event.

**Evidence:** [apps/mobile/app/(client)/events/[id].tsx:108](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:108); [apps/api/src/modules/events/edit.ts:43](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/edit.ts:43); [apps/mobile/app/(client)/events/[id].tsx:205](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:205).

**Acceptance:** Model closing recruitment separately from cancelling paid bookings. Allow safe headcount changes with a floor at occupied capacity and explicit handling of active checkouts; define which nonfinancial event fields can change after hiring. Explain locked fields and show a support/alternative path. Duplicate may be a prefilled create flow and must never copy bookings/payments. These management actions are required by UXRD, while the exact edit policy needs reconciliation with present backend safeguards.

### C05 — P1: Event progress calls unpaid and refunded bookings “confirmed”

**Type:** Incorrect lifecycle display blocking staffing recovery. **Requirement:** UXRD §§6.2, 6.6, 6.9; “X of N” hiring model.

**Reproduce:** Start a checkout without paying, or fully refund a booking. Event detail computes confirmed staff from the count of all booking records. A cancelled/refunded slot can still appear occupied; a pending-payment row can appear confirmed. The server's staffing status excludes vacated bookings, so the status pill and headline can contradict one another.

**Evidence:** Unfiltered count [apps/api/src/modules/events/routes.ts:133](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/routes.ts:133) → [apps/mobile/app/(client)/events/[id].tsx:102](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:102) → displayed claim [apps/mobile/app/(client)/events/[id].tsx:155](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:155). Authoritative vacated states [apps/api/src/modules/events/staffing.ts:4](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/staffing.ts:4) and count [apps/api/src/modules/events/staffing.ts:25](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/staffing.ts:25).

**Acceptance:** Return separate confirmed, reserved/pending-payment, vacated and available counts. Pending reservations must consume capacity without being called paid/confirmed. After cancellation, expiration, refund and replacement the headline and available slots agree with authoritative lifecycle state.

### C06 — P1: Application selection ignores remaining capacity and unusable application states

**Type:** Missing selection states and validation; backend protects payment. **Requirement:** UXRD §6.7.

**Reproduce:** On a six-person event with four existing active bookings, applications says “0 of 6 open slots selected,” permits selecting three, and accepts them sequentially before checkout rejects OVERBOOKED. Withdrawn applications also remain selectable; already-booked accepted applicants are not distinguished from new choices. The server rejects these only after interaction.

**Evidence:** [apps/mobile/app/(modals)/applications.tsx:53](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:53); sequential acceptance [apps/mobile/app/(modals)/applications.tsx:66](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:66); only rejected/shortlisted states [apps/mobile/app/(modals)/applications.tsx:85](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:85); checkbox [apps/mobile/app/(modals)/applications.tsx:150](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:150). Server rejects withdrawn/live booking [apps/api/src/modules/events/recruitment.ts:49](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/events/recruitment.ts:49) and capacity [apps/api/src/modules/bookings/service.ts:114](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:114).

**Acceptance:** Calculate live remaining slots, cap selectable choices, and show booked, withdrawn, rejected, accepted/unpaid and unavailable states. Revalidate on fresh data before confirmation. If eligibility changes, preserve remaining valid choices and identify exactly who changed. Do not weaken server concurrency/capacity guards.

### C07 — P2: Accepted staff do not become a resumable basket until payment is attempted

**Type:** Missing pre-checkout state/recovery. **Requirement:** UXRD §6.7 pending-payment basket.

**Reproduce:** Select candidates, tap Pay & confirm, reach Payment Summary, then back out before pressing Pay or terminate the app. ACCEPTED writes have already happened, but selected IDs live only in local component state/route params. Returning to Applications starts with no selection and gives accepted candidates no accepted badge. A failure halfway through sequential acceptance creates the same partial-acceptance ambiguity.

**Evidence:** [apps/mobile/app/(modals)/applications.tsx:40](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:40) and [apps/mobile/app/(modals)/applications.tsx:73](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/applications.tsx:73); payment selection restoration only from saved checkout/route [apps/mobile/app/(modals)/payment-summary.tsx:35](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/payment-summary.tsx:35); durable checkout begins on submit [apps/mobile/lib/checkout.ts:65](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/checkout.ts:65).

**Acceptance:** Persist/reconstruct an event's accepted unpaid selection before starting payment; show it as a basket with named candidates and removal actions; distinguish accepted invitations from paid bookings. Restore after back, relaunch and partial request failure without accidentally selecting booked or withdrawn staff.

### C08 — P1: Report-a-problem form exists but clients cannot reach it from a booking

**Type:** Missing entry action, not a missing form. **Requirement:** UXRD §§6.10, 6.13; PRD §§8,13.

**Reproduce:** During a confirmed or checked-in booking, a client needs to report false arrival, lateness or misconduct. Event detail and roster offer code/cancel/release/rate but no Report a problem. The dispute route only works if manually navigated with a booking parameter.

**Evidence:** Roster action branches [apps/mobile/app/(modals)/event-day.tsx:127](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:127); event actions [apps/mobile/app/(client)/events/[id].tsx:205](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/events/[id].tsx:205); existing form [apps/mobile/app/(modals)/dispute.tsx:25](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/dispute.tsx:25) and API [apps/api/src/modules/bookings/routes.ts:127](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/routes.ts:127). Literal route scan across mobile app/lib found no incoming dispute navigation; graph traces show the form calls its hook, which calls the API in source.

**Acceptance:** Put Report a problem on eligible event/booking rows and release confirmation, retain booking/person context, explain freeze consequences, and open the form. Use server-provided eligibility. Post-payout disputes are separately blocked by the documented backend state machine: do not promise that adding this button solves them.

### C09 — P1: A self-asserted arrival is invisible to the client before it can auto-release funds

**Type:** Missing event-day state and recourse. **Requirement:** UXRD §6.10 passive-client rule.

**Reproduce:** Usher uses “I've arrived” without code verification. API sets arrivalAssertedAt while booking remains CONFIRMED. Client row still says confirmed and presents Code/Cancel; it does not show the self-arrival claim. The auto-complete worker treats that timestamp as sufficient after end plus grace. Combined with C08, the client has neither a visible claim to inspect nor the specified dispute action in the app.

**Evidence:** [apps/api/src/modules/bookings/service.ts:213](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:213); auto-complete eligibility [apps/api/src/modules/bookings/service.ts:253](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:253); roster display/actions [apps/mobile/app/(modals)/event-day.tsx:119](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:119). The field is absent from the roster's rendering logic.

**Acceptance:** Show “Arrival reported by usher” with time, distinguish it from verified check-in, state the auto-release deadline and provide report-problem access before that deadline. Keep both timestamps in the booking contract. Do not label a self-assertion as verified attendance.

### C10 — P1: Cancellation preview uses a different timezone from settlement

**Type:** Incorrect financial decision preview. **Requirement:** UXRD §6.12 exact outcome; PRD §13.

**Reproduce:** At 47.5 actual hours before a Lagos event, frontend startDate interprets the entered local event time as UTC, making the event appear one hour later. It can show >48h/full refund with a Cancel button while the server computes the 12–48h split window and refuses self-service. The 12-hour boundary is similarly misquoted.

**Evidence:** Frontend [apps/mobile/app/(modals)/cancellation.tsx:30](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:30) and [apps/mobile/app/(modals)/cancellation.tsx:72](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:72); backend converts Lagos UTC+1 [apps/api/src/modules/bookings/service.ts:73](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:73) and settles from that instant [apps/api/src/modules/bookings/service.ts:460](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:460).

**Acceptance:** Use one shared Lagos instant helper or a server-generated cancellation quote including server time, eligibility, refund, compensation and expiry. Verify just before/at/after 48h and 12h in multiple device timezones. Gate processing-fee copy on effective policy; current line125 says Non-refundable despite STATUS line18 recording deductions disabled.

### C11 — P1: Cancellation/refund has no durable pending or support-settlement journey

**Type:** Missing status/follow-up surface plus documented backend limitation. **Requirement:** UXRD §§6.12,9; PRD §13; docs/STATUS limits apply.

**Reproduce:** Provider refund outcome is pending. Server returns REFUND_PENDING; the UI presents “Couldn't cancel,” leaves the cancellation action available, and offers no refund reference/timeline/detail. On success it dismisses the entire modal stack with a toast. For late cancellation it promises the team settles manually, but current STATUS explicitly says split execution and admin partial refunds are unsupported; a support link does not establish a completed money workflow.

**Evidence:** [apps/api/src/modules/bookings/service.ts:462](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:462)–470; generic result handling [apps/mobile/app/(modals)/cancellation.tsx:83](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:83); support promise [apps/mobile/app/(modals)/cancellation.tsx:139](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/cancellation.tsx:139); [docs/STATUS.md:15](/Users/leslieisah/app-dev/hire-quick/docs/STATUS.md:15). Booking detail includes payment but no dedicated refund-case UI [apps/api/src/modules/bookings/routes.ts:65](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/routes.ts:65).

**Acceptance:** Treat accepted/pending refund as pending, show amount/reference/status and expected next step after relaunch, and support safe refresh/escalation. Record a cancellation request for late windows with an honest operational state. Implement and verify split settlement or explicitly narrow the launch policy; never imply an unsupported operator action has already occurred.

### C12 — P1: Dispute submission has no evidence exchange or customer case tracking

**Type:** Missing screens and participant API contract. **Requirement:** UXRD §6.13; PRD §13 both-party evidence and recorded outcome.

**Reproduce:** Even if the form is reached directly, the client can send only reason/note. It cannot attach photos, view a submitted case, follow OPEN → UNDER_REVIEW → resolved, respond to evidence requests or inspect outcome. Success discards the returned dispute ID and goes back. The other party has no participant case UI. This remains missing after adding C08's entry action.

**Evidence:** Form payload/success [apps/mobile/app/(modals)/dispute.tsx:36](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/dispute.tsx:36); fields [apps/mobile/app/(modals)/dispute.tsx:53](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/dispute.tsx:53); POST schema [apps/api/src/modules/bookings/routes.ts:131](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/routes.ts:131); service stores reason/note and returns ID [apps/api/src/modules/bookings/service.ts:375](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:375). Bounded booking/events route inventory exposes no participant dispute-detail/evidence-update endpoints. Admin functionality is assessed separately.

**Acceptance:** Preserve ID and open an authorized case-detail screen with booking/person, evidence, state, expected next step and decision. Support photo upload and both-party additions, with clear submitted/upload-failed states. Display refund/release outcome from authoritative settlement. A blanket 72-hour post-payout promise remains a known unsupported backend capability per [docs/STATUS.md:17](/Users/leslieisah/app-dev/hire-quick/docs/STATUS.md:17).

### C13 — P2: Multi-staff reviews never become a named pending/completed task list

**Type:** Missing review queue and completed state. **Requirement:** UXRD §§6.2,6.11; PRD §11.

**Reproduce:** After paying out several staff, each roster row offers Rate forever. The rating route receives the literal name “your usher,” so the destination does not identify the selected person. Successful submission goes back; re-entering still offers Rate and the API then reports ALREADY_REVIEWED. Home has no pending-review section.

**Evidence:** Rate eligibility [apps/mobile/app/(modals)/event-day.tsx:127](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:127) and name [apps/mobile/app/(modals)/event-day.tsx:306](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:306); [apps/mobile/app/(modals)/rate-staff.tsx:29](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/rate-staff.tsx:29) and success [apps/mobile/app/(modals)/rate-staff.tsx:49](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/rate-staff.tsx:49); mutation has no review-state invalidation [apps/mobile/lib/hooks.ts:221](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/hooks.ts:221); list booking payload lacks review relation [apps/api/src/modules/bookings/routes.ts:42](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/routes.ts:42); duplicate guard [apps/api/src/modules/bookings/service.ts:413](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:413); home sections [apps/mobile/app/(client)/home.tsx:131](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/home.tsx:131).

**Acceptance:** Expose current-user review status with each paid booking. Show real staff name/photo/event in the form, mark submitted reviews completed, and offer the next unreviewed person or a review queue. On relaunch the pending count remains accurate.

## Additional P2 completeness details

- **Date choice silently constrains creation.** Create offers only tomorrow through day60 ([apps/mobile/app/(modals)/create-event.tsx:69](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/create-event.tsx:69)); edit likewise generates60dates ([apps/mobile/app/(modals)/edit-event.tsx:45](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/edit-event.tsx:45)). UXRD §6.3 specifies date selection but no such horizon. Use an actual date picker matching server eligibility or document an intentional launch restriction. This is a product/contract reconciliation item, not proof that same-day staffing must be promised.
- **Payment REVIEW handoff is incomplete.** Correct copy tells clients to contact support with order number ([apps/mobile/lib/checkout.ts:104](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/checkout.ts:104)), but status screen buttons only refresh/resume/leave/done ([apps/mobile/app/(modals)/funds-held.tsx:93](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/funds-held.tsx:93)). Add a support action carrying order reference and state while preserving the original checkout. Current durable recovery itself works in source and is not counted as absent.
- **Duplicating an event** is part of C04, and the **no-applications browse route** is part of C01; do not inflate these into extra independent blockers.

## Positive current evidence

- Create flow validates per step, performs final schema validation and routes to success only after API creation ([apps/mobile/app/(modals)/create-event.tsx:115](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/create-event.tsx:115)).
- Payment summary transparently states the 15% fee is borne by staff, does not add it to the client's total, and uses selected line items ([apps/mobile/app/(modals)/payment-summary.tsx:197](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/payment-summary.tsx:197)).
- Recovery saves the original request/key before transport, reuses original checkout, distinguishes uncertainty/expiry/refund states and clears only terminal acknowledged checkout ([apps/mobile/lib/checkout.ts:65](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/checkout.ts:65); [apps/mobile/app/(modals)/funds-held.tsx:32](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/funds-held.tsx:32)). This supersedes older generic “payment success assumed” concerns.
- Event day has explicit release confirmation, names the intended staff member for generated codes, displays expiry, and exposes refresh failures ([apps/mobile/app/(modals)/event-day.tsx:69](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:69); [apps/mobile/app/(modals)/event-day.tsx:254](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-day.tsx:254)).
- Backend ownership, eligibility, lifecycle and capacity guards protect against invalid hiring despite UI gaps. Improving UX must preserve these guards.

## Scope and evidence limits

PRD §17 / UXRD §14 defer saved favorite staff and emergency replacement suggestions to V1.5; their absence is not a V1 defect here. QR is an alternative to OTP, not a required second attendance method. No requirement for a separate draft editor is inferred from a Draft status label. Post-payout dispute, split cancellation and refund-operation ambiguity are known documented limitations and are distinguished from missing client entry points.

Client routes, targeted modal state/handlers, hooks, booking/events routers and underlying recruitment/edit/staffing/booking services were source-read or screened at the cited sections. This is a flow-focused review, not a line-by-line rereview of every unrelated mobile component or all44 app routes. Main audit owns the complete route inventory and shared flows. No performance, screen-reader, provider-delivery or device rendering verdict is claimed.

Graph Auditor evidence: project Users-leslieisah-app-dev-hire-quick; initial ready4913nodes/15928edges, supplied generation2026-09-18T18:23:11Z; coverage refreshed to generation2026-09-18T18:29:43Z. Function discovery pages for client routes, events and bookings were complete. Both-direction depth1 traces were completed without truncation for inviteToEvent, editEvent, confirmBatch, openDispute, cancelBookingByClient, createReview and useCreateDispute. All27 cited/inspected evidence paths and bounded mobile app/lib + backend events/bookings scopes were coverage-checked; only UI gap dispute.tsx:68 was read directly in its full source. Event test parse gaps were outside production-flow evidence and no test-completeness claims rely on them. Exact navigation/API literals were searched after graph discovery to verify missing links. Clean coverage remains best-effort, not proof of completeness.

