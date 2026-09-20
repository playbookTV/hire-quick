# Usher lifecycle completeness review — 18 September 2026

Source-based assessment for Ada, a Lagos freelance usher who needs to find appropriate work, know whether it is truly confirmed, record attendance without depending on an available host, and receive and track earnings. This is a flow-completeness review, not a native-device walkthrough or visual score. No remote API calls or financial actions were performed. No application files were changed.

## Evidence and coverage

Auditor tier. Graph project `Users-leslieisah-app-dev-hire-quick`, ready, 4,913 nodes / 15,928 edges, generation `2026-09-18T18:23:11Z`. Graph symbol searches and file queries completed without remaining pages; arrival traced inbound and outbound. Exact-source reads verified material behavior. Coverage checked mobile app/lib, bookings, events, profile, payments HTTP scopes and cited source files. All exact cited paths matched generation; the known partial parse in `dispute.tsx:68` was directly read. The two event-test parse gaps were also directly read and do not provide production-flow evidence. Coverage is best effort, not proof of completeness. Negative claims below are bounded to these inspected mobile routes/hooks and API routers.

Requirements: PRD §§8–13 and UXRD §§7, 9, 11. Current boundaries in `docs/STATUS.md:15–26` supersede assumptions that old specifications are all implemented. In particular, late client cancellation and post-payout disputes are documented backend limitations. The previous UI audit's fixed gross-payout, calendar-column and misleading instant-KYC findings are not repeated as current defects.

## Flow matrix

| Journey | Present in source | Missing or incomplete link | Assessment |
|---|---|---|---|
| Create professional profile | Name, bio, experience, avatar and portfolio; later edit includes languages/location/rate | Initial language choices are not submitted | Partial: U09 |
| Submit ID and selfie | Permission request, upload, submit, server-error state | Native permission/upload round trip untested | Source-supported path |
| Await review, receive approval/rejection, resubmit | Submission-aware pending screen; approved state; rejected reason/support/resubmit | Waiting view does not poll or offer Check status; home/profile send pending users into new submission | Partial: U10 |
| Browse work | Available feed and save/unsave | No date/distance/budget filters or client reputation context | Partial: U11 |
| Apply and track | Apply mutation; Applied statuses | Accepted application called Booked before payment; detail remains Apply now | Partial: U03 |
| Decline an invitation after applying | Backend withdraws associated application | Applied tab cannot render WITHDRAWN | Broken source path: U02 |
| Review and respond to invitation | Notification opens invitation; accept/decline; explicit pending-payment explanation | No dedicated invitation list; accepted invitation has Close only despite backend withdrawal transition | Partial: U12 |
| Withdraw ordinary application | Shared/backend state includes WITHDRAWN | No usher withdrawal UI or dedicated ordinary-application route found | Product completion gap: U12 |
| View confirmed work and past bookings | Home has upcoming rows; check-in has booking context; API lists all bookings | My jobs is recruitment only; no complete booking history/detail hub | Partial: U04 |
| Manage availability | Month navigation, persisted availability, booking locks, pending/error guards | Locked dates cannot open their associated booking | Source-supported availability; booking navigation in U04 |
| Coordinate with client | Usher messages delegates to shared ConversationList | Shared messaging reviewed by parent | Out of this subreview |
| Check in with host code | Six-digit submission; failure/success; authoritative net-payout copy | Native execution untested | Source-supported path |
| Arrive without host / passive host | Backend /arrived and auto-complete exist | No mobile self-arrival action or hook | Missing critical action: U01 |
| Scan host QR | UXRD alternative specified | No scanner in check-in or corresponding mobile hook | Missing alternative: U13 |
| Cancel a confirmed booking | Role-aware backend cancellation | No usher entry; shared sheet hardcodes client financial policy | Missing usable path: U05 |
| Open and follow dispute | Either-party creation backend subject to eligibility | No usher entry; client-specific reasons; no evidence upload or tracking journey | Missing usable path: U06 |
| Rate client after work | Two-way backend createReview | Only staff-rating screen and client event-day entry | Missing usable path: U07 |
| Read own reputation | Average rating, completed count, reliability percentage, received reviews | No incident breakdown explaining the reliability number | Partial: U14 |
| View available and held earnings | Separate available, pending escrow and lifetime summary | No booking-level earnings detail from activity | Partial: U04/U08 |
| Add bank account and withdraw | Bank picker, name resolution, review, persisted request, safe retry, status-specific receipt | Later withdrawal outcomes and older history unavailable through wallet | Partial: U08 |

## Prioritized gaps and acceptance criteria

### U01 — P1: Self-arrival protection exists on the server but is unavailable to the usher

**Trigger:** Ada arrives, but the client cannot or will not provide a check-in code. **Requirement:** PRD §8 at `documentation/02-HireQuick-PRD.md:159–161`, UXRD §11 at `documentation/03-HireQuick-UXRD.md:225`: independent “I've arrived” plus event-end/grace completion.

**Evidence:** `apps/mobile/app/(modals)/check-in.tsx:99–132` offers only the host-code path; `apps/mobile/lib/hooks.ts:183–190` only submits check-in codes. Mobile route/hook searches found no `/arrived` call. `apps/api/src/modules/bookings/routes.ts:106–112` and `service.ts:213–223` implement arrival assertion. The no-show sweep specifically selects bookings with neither check-in nor asserted arrival (`service.ts:311–318`).

**Impact:** The documented protection against a passive host cannot be invoked from the app. An actual worker can remain eligible for the no-show process. **Missing:** Action, hook, persisted arrival state, pending/error/success feedback and explanation of the completion window. **Acceptance:** An eligible usher can assert arrival without a code; reopening shows the server timestamp; retries do not create contradictory feedback; the client-code path remains available; a server acceptance test confirms self-arrival excludes the booking from no-show handling and permits eligible auto-completion. Do not label self-arrival as client verification.

### U02 — P1: Declining an invitation can make the Applied tab fail to render

**Trigger:** Apply to an event, receive its invitation, decline, then open Applied. **Requirement:** Usher can accept/decline invitations and track applications (PRD §9; UXRD §§7.2, 7.5).

**Evidence:** Decline writes `WITHDRAWN` to related applications in `apps/api/src/modules/events/recruitment.ts:99–101`; `/me/applications` returns all statuses (`routes.ts:213–224`). Mobile `ApplicationStatus` omits WITHDRAWN (`apps/mobile/lib/types.ts:192`). `apps/mobile/app/(usher)/jobs.tsx:27–32` has no matching badge; `:121–123` reads `b.label` without a fallback. This is a source-derived undefined-property failure, not a reproduced native crash.

**Missing:** Complete status contract and withdrawn branch. **Acceptance:** Applied renders every shared application status, including WITHDRAWN, without exception; declined/withdrawn entries explain their outcome; unknown future states render safely. Cover the actual apply → invitation → decline → Applied sequence.

### U03 — P1: An accepted application is presented as a confirmed booking before payment

**Trigger:** Client accepts Ada's application, or Ada accepts an invitation, before checkout. **Requirement:** UXRD §7.5 at `:159` says confirmation follows payment; §9 maps Booked to CONFIRMED (`:204`).

**Evidence:** `jobs.tsx:30` maps application ACCEPTED to Booked. Invitation acceptance merely creates an ACCEPTED application (`apps/api/src/modules/events/recruitment.ts:95–97`); the invitation itself correctly says booking awaits payment (`apps/mobile/app/(modals)/invitation.tsx:71–75,150–154`). Every application card opens generic event details (`jobs.tsx:45,123`), whose button remains Apply now (`event-details.tsx:150`).

**Impact:** Ada may treat unpaid prospective work as guaranteed, while revisiting it provides no useful next state. **Missing:** Selected/awaiting-payment branch and a real confirmed-booking link. **Acceptance:** Accepted-but-unpaid shows “Selected — awaiting client payment”; only the corresponding funded CONFIRMED booking says Booked; applied/shortlisted/rejected/withdrawn states replace the generic Apply action appropriately. An existing application cannot silently be presented as a fresh submission.

### U04 — P1: No complete usher booking detail/history journey

**Trigger:** Open a confirmed job from Profile, review an old payout, or understand a cancellation/refund/dispute. **Requirement:** PRD §9 (`:187`) requires booking/payout status; UXRD §9 (`:198–209`) requires visible terminal/exception branches.

**Evidence:** My jobs has only Available/Applied/Saved (`apps/mobile/app/(usher)/jobs.tsx:20–25`). Profile's job row and See all open the default jobs feed (`profile.tsx:132,142`); Home's See all does the same (`home.tsx:365`). `apps/mobile/lib/bookings.ts:17–18` excludes PAID/CANCELLED but includes stale NO_SHOW/REFUNDED/DISPUTED and does not filter by date. Home opens every retained row in check-in (`home.tsx:374–380`), where exception states say “Not ready … It’ll open here on the event day” (`check-in.tsx:178–184`). Calendar job dates are disabled (`calendar.tsx:265`). API already provides list/detail (`apps/api/src/modules/bookings/routes.ts:36–84`).

**Impact:** Paid/cancelled work disappears from the main work surface; exception states imply future eligibility instead of showing their outcome. **Missing:** Active/Past booking list and role-aware booking detail, linking event context, status timeline, attendance, gross/fee/net, payment and permitted actions. **Acceptance:** Every booking status is reachable from history; profile/calendar/list links open that booking; cancelled/refunded/no-show/disputed states show accurate reasons and next steps; money remains separated into held, released and transferred. This hub should host U01/U05/U06/U07 rather than scattering recovery across unrelated tabs.

### U05 — P1: Usher cancellation has no safe discoverable path

**Trigger:** Ada cannot attend a confirmed booking. **Requirement:** PRD §8 (`:171–173`) requires either party to see policy consequences before cancellation.

**Evidence:** No cancellation navigation was found in usher routes/check-in. The shared cancellation modal always calls `policyForCancellation('CLIENT', window)` (`apps/mobile/app/(modals)/cancellation.tsx:73`), labels client refund as “Refund to you” (`:120`) and gates self-service on the client refund percentage (`:80`). Backend correctly selects `cancelBookingByUsher` (`apps/api/src/modules/bookings/routes.ts:160–162`) and uses usher policy (`service.ts:501–505`), with reliability effects (`:518–531`).

**Missing:** Usher entry point and usher-specific confirmation/outcome. Merely linking the current modal would show the wrong person's money and policy. **Acceptance:** Confirmed booking detail offers Cancel; preview explains lost earnings, client refund, actual reputation/suspension consequences and reason; role-specific service handles execution; pending/refund-review outcomes remain visible; success removes work from active commitments and preserves it in history.

### U06 — P1: Usher dispute and evidence-follow-up journey is missing

**Trigger:** A checked-in usher reports a payment/conduct problem, or needs to respond to a client's dispute. **Requirement:** PRD §8 (`:175–177`) says both parties submit evidence; UXRD §6.13 (`:133`) requires photos and status-to-resolution tracking.

**Evidence:** No usher dispute entry found. `apps/mobile/app/(modals)/dispute.tsx:20` offers client-oriented reasons, sends reason/note only (`:36–41`) and returns after a toast. No photo control or dispute history/detail hook exists in the inspected mobile scope. API creation accepts reason/note only (`apps/api/src/modules/bookings/routes.ts:127–136`); service creates OPEN (`service.ts:375–379`). Usher must have `checkedInAt` (`:363–364`). The inspected bookings router has no party-facing dispute read/evidence-update route. `docs/STATUS.md:17` explicitly records COMPLETED/PAID cannot transition to DISPUTED.

**Impact:** Affected workers lack the promised recourse and cannot follow the resolution. **Missing:** Role-appropriate report action/reasons, protected evidence upload, case detail/status/outcome, and respondent evidence API/UI. **Acceptance:** Eligible party can open a case, attach evidence and see a persistent case identifier/status; counterparty can submit evidence; outcome explains financial result; unsupported post-payout cases provide truthful support escalation. This requires backend/product work, not only a new screen. Reconcile self-arrival-only eligibility with the existing checkedInAt guard explicitly.

### U07 — P2: Two-way reviews stop at the backend

**Trigger:** Ada completes paid work and wants to rate the client. **Requirement:** PRD §§8/11 (`:165–167,203`); UXRD §6.11 (`:125`).

**Evidence:** Backend `createReview` supports either party and updates the client aggregate when the usher reviews (`apps/api/src/modules/bookings/service.ts:403–427`). The only mobile rating route is `rate-staff.tsx`; it defaults to “your usher” (`:30`) and titles itself “Rate your staff” (`:60`). Route references lead from client event-day, not usher journeys. Paid check-in offers View wallet only (`check-in.tsx:164–176`), while paid work is excluded from upcoming (`lib/bookings.ts:18`).

**Missing:** Rate client entry/composer, outstanding/completed review state and client reputation display. **Acceptance:** A paid booking shows the correct client identity and Rate client action; one submitted review becomes read-only; duplicate retries reconcile with ALREADY_REVIEWED; client rating/count becomes visible where ushers evaluate a job. The server currently requires PAID, so the UI must not promise availability at an earlier transient COMPLETED state.

### U08 — P1: Pending withdrawals have no durable status/detail/history destination

**Trigger:** A withdrawal returns PROCESSING, Ada taps Done, and the bank later succeeds or fails. **Requirement:** UXRD §7.6 (`:163`) requires withdrawal history and failed-transfer recovery.

**Evidence:** Receipts correctly distinguish REQUESTED/PROCESSING/PAID/FAILED (`apps/mobile/lib/withdrawal.ts:125–143`) but advise checking wallet for updates. The wallet renders generic noninteractive activity rows (`apps/mobile/app/(usher)/wallet.tsx:174–181`). API joins withdrawals only to obtain bank last-four and omits withdrawal status/reference from activity (`apps/api/src/modules/payments/http/routes.ts:121–139`). Only the latest 25 ledger entries are returned (`:108–111`) with no pagination. The inspected payments router contains POST withdrawals but no GET withdrawal list/detail. A saved receipt returns its old outcome locally (`apps/mobile/lib/withdrawal.ts:66`), and Done deletes it (`:88–100`; `withdraw.tsx:235–243`).

**Impact:** After an initially pending response, the user cannot inspect the authoritative later outcome in the app, or retrieve older withdrawals. This does not allege missing backend settlement. **Missing:** Party-owned withdrawal read/list APIs, durable status page, history pagination, failed/reversed outcome and correction path. **Acceptance:** Request → pending → paid/failed/reversed remains trackable after Done/restart and on another authenticated device; amount, destination, time, reference and restored-balance outcome are clear; refresh reads status rather than submits a new money request; prior withdrawals remain reachable beyond 25 ledger entries. Existing safe retry and bank-add flows should be retained.

### U09 — P2: Initial profile language selections are discarded

**Trigger:** Ada selects her languages during profile setup and taps Continue. **Requirement:** UXRD §7.1 (`:141`).

**Evidence:** `apps/mobile/app/(verification)/profile-setup.tsx:35,71–75` holds language choices locally, but `:40–41` submits only name/bio/experience. Backend accepts languages (`apps/api/src/modules/profile/routes.ts:45,172`); later Edit profile sends them (`apps/mobile/app/(modals)/edit-profile.tsx:65`).

**Missing:** Save/readback in onboarding, not a new screen. **Acceptance:** Selections persist, survive restart, and match Edit profile and the public profile; initialization uses existing saved values instead of unconditional English/Yoruba defaults.

### U10 — P2: Returning to pending verification starts submission again instead of status tracking

**Trigger:** Submit documents, browse jobs while waiting, then revisit verification. **Requirement:** UXRD §7.1 pending → approved/rejected and §9 rejection reason/resubmit.

**Evidence:** Pending Home always says Start verification and opens profile setup (`apps/mobile/app/(usher)/home.tsx:257–267`); Profile always sends any non-VERIFIED usher to document upload (`profile.tsx:167–168`). The actual waiting/status screen exists (`apps/mobile/app/(verification)/awaiting-approval.tsx:99–107,150–188`), but its query has no interval (`apps/mobile/lib/hooks.ts:486–501`) and the screen has no refresh/check-status action. Rejection reasons and resubmit/support exist (`verification-rejected.tsx:17–32`).

**Missing:** State-aware return route and explicit refresh/recovery; this is not a claim the approval backend is absent. **Acceptance:** Draft users resume submission, pending users view current submission, rejected users see the latest reason, approved users see unlocked state; waiting screen can check again and refreshes app-user verification state. Do not make native focus behavior the sole implicit recovery mechanism.

### U11 — P2: Job discovery omits the specified narrowing and client-trust steps

**Trigger:** Ada seeks work on a particular day/pay range or evaluates an unfamiliar organizer. **Requirement:** UXRD §§7.3–7.4 (`:151–155`) requires date/distance/budget filters and client rating.

**Evidence:** Jobs offers only three tabs and an unfiltered `useEvents()` (`apps/mobile/app/(usher)/jobs.tsx:20–43,83–84`). API applies a profile-state restriction and date sort but reads no filter query (`apps/api/src/modules/events/routes.ts:103–121`). Job details shows date/venue/dress/requirements/slots without client rating (`apps/mobile/app/(modals)/event-details.tsx:96–141`); event detail API does not join client reputation (`events/routes.ts:135`).

**Missing:** Filter sheet/results/reset/empty state and client reputation summary. **Acceptance:** Date and budget narrow results, filters persist sensibly across detail/back, clearing restores feed, empty state offers reset, client rating/count have truthful no-review states. Distance requires an explicit coarse-location contract that preserves exact-venue privacy; do not reveal protected venues merely to satisfy an old spec line. Availability conflicts should be explained before submission while preserving the authoritative server guard.

### U12 — P2: Recruitment has no full return/withdrawal journey

**Trigger:** Ada wants to see pending invitations again or withdraw before a client pays. **Requirement:** Invitation review/response in UXRD §7.5; ordinary-application withdrawal is a completion recommendation, not an explicit acceptance criterion in the cited PRD.

**Evidence:** `useMyInvitations` exists with no callers (`apps/mobile/lib/hooks.ts:559–565`); Jobs has no invitations destination. Notification deep-link exists, so invitations are not wholly unreachable (`apps/mobile/app/(modals)/notifications.tsx:86–87`). After acceptance the invitation only offers Close (`invitation.tsx:167–198`), although backend permits ACCEPTED → DECLINED (`apps/api/src/modules/events/recruitment.ts:17–18`) when no live booking blocks it (`:91`). Ordinary application mutation in `events/routes.ts:301–311` is client-only; inspected routes have no usher withdrawal action.

**Missing:** Invitation inbox and accepted-but-unpaid withdrawal affordance; decision and backend contract for direct application withdrawal. **Acceptance:** Pending/responded invitations are reachable without hunting notification history; accepted unpaid invitation can be withdrawn with server eligibility checks; funded commitments route to cancellation. If ordinary applications support withdrawal, define WITHDRAWN/reapply behavior, prevent stale client selection and display that state (U02).

### U13 — P3 / scope decision: The specified QR attendance alternative is absent

**Trigger:** Ada chooses to scan the host's attendance code. **Requirement:** UXRD §11 (`:224`), PRD attendance (`:157`). **Evidence:** `apps/mobile/app/(modals)/check-in.tsx:99–132,219–225` offers numeric entry only; mobile hooks and inspected booking attendance routes expose code generation/verification, no QR-specific UI. **Missing:** Scanner plus compatible host presentation, permission denial and invalid/expired handling. **Acceptance:** Scan resolves the same booking-bound server verification and retains numeric fallback; otherwise formally defer QR in requirements so the OTP-only release is explicit. This is an alternative-path gap, not a blocker to successful OTP check-in.

### U14 — P2: Reliability percentage lacks the promised incident explanation

**Trigger:** Ada notices her standing fall and wants to understand why. **Requirement:** UXRD §7.8 (`:171`) requires no-show/late-cancellation signals and policy guidance.

**Evidence:** Profile shows percentage and general explanatory text (`apps/mobile/app/(usher)/profile.tsx:172–198`), but no dates, incidents, no-show/late-cancel counts or links to affected bookings. Upcoming excludes some terminal work and has no history (U04). **Missing:** Reliability detail backed by attributable booking outcomes. **Acceptance:** User can identify which incidents affect the score, view the relevant booking, see actual current policy and contact support about an incorrect record. General guidance and existing reviews should remain.

## Recommended build sequence

1. Fix WITHDRAWN rendering and accepted-versus-funded labels (U02/U03).
2. Build the usher booking hub/history and all status branches (U04).
3. Add self-arrival, usher cancellation, dispute entry/case journey and rate-client from that hub (U01/U05/U06/U07); backend/product decisions are required for full dispute evidence and post-payout scope.
4. Add authoritative withdrawal tracking/history (U08).
5. Complete verification return routes, onboarding saves, recruitment withdrawal/inbox and discovery filters (U09–U12).
6. Add/defer QR explicitly and complete reliability detail (U13/U14).

Native acceptance remains required: ID permission denial/upload retry, pending verification return, apply/decline status round trip, booking branches, passive-host arrival, cancellation preview, dispute evidence/status, rate-client, and pending withdrawal recovery. These source findings must not be represented as completed device tests.
