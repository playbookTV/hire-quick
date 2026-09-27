# Admin operational flow completeness review — 18 September 2026

## Scope and evidence

Independent source-based assessment of `apps/admin/src`, the complete admin router/service, the payment-recovery handoff, and PRD/UXRD/TRD/current operational documentation. No application edits or live administrative mutations were made. Findings describe deterministic source behavior and missing UI coverage, not a live acceptance-test pass.

Graph: `Users-leslieisah-app-dev-hire-quick`, full generation `2026-09-18T18:23:11Z`, ready, 4,913 nodes / 15,928 edges. Enumerated 24 admin/API-admin files and all 81 functions in those scopes; both result sets exhausted. Traced both directions at depth 1 for `resolveDispute`, `decideApproval`, and `executeApprovalOp`, with complete pagination. Read the relevant source directly. `check_index_coverage` returned matching metadata and no recorded issue for all 20 evidence paths and both negative-claim scopes (`apps/admin/src`, `apps/api/src/modules/admin`). This coverage is best effort, not proof of completeness. General API endpoints outside the admin module were not exhaustively audited; statements about missing backend endpoints below are scoped to the admin router.

The authenticated console registers six destinations: Overview, Verifications, Disputes, Approvals, Ledger, Users. This is the full route/nav inventory, not a sample: [App.tsx:18](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/App.tsx:18), [Layout.tsx:4](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/Layout.tsx:4).

## Flow inventory

| Operator job | Existing route / capability | Completeness | Minimum missing step |
|---|---|---|---|
| See workload | `/`, counts linking to queues | Present, basic | Ages, escalation and execution backlog are absent |
| Verify identity | `/verifications`, inspect ID/selfie, approve/reject with reason | Core pending-review flow present | Search/history and structured rejection code |
| Resolve an open dispute | `/disputes`, booking/attendance summary, proposed payout/refund, rationale | Partial | Full evidence, durable case link, rejected-proposal recovery |
| Check another admin’s proposal | `/approvals`, inspect case, approve/reject | Partial | Approved/failed/executed/rejected history and execution status |
| Initiate a support refund | Backend `POST /api/admin/refunds` | UI absent | Find booking → preview eligible full refund → reason → submit → track |
| Investigate a booking | BookingReview embedded in dispute/approval panel | Contextual only | General searchable booking detail outside an existing case |
| Inspect escrow entries | `/ledger`, pagination and booking-ID filter | Read-only ledger present | Link to booking/payment case, provider operations and reconciliation |
| Handle payment exceptions | Worker recovery and runbooks | Console absent | Read-only exceptions queue, references, age, outcome, escalation |
| Suspend/reinstate user | `/users`, phone/email/role search, confirmation | Core mutation present | User detail/context/history/reason; linked bookings and disputes |
| Oversee events | UXRD nav names Events | Console absent | Event search/detail/roster and linked bookings |
| Configure reward tiers | Backend list/create/update/deactivate endpoints | UI absent | Tier list/editor and existing-reward preservation |
| Fulfil earned physical reward | Backend queue and fulfil endpoint | UI absent | Recipient/reward queue → fulfil confirmation → history |
| View reports/analytics | PRD requires reports; overview exposes six counters | Specification gap | Define launch metrics, filters and export/read model |
| Manage categories | PRD requires category management | Specification gap | Product scope and supporting admin API/UI; no equivalent in current admin router |

## Priority findings

### ADM-01 · P1 · Rejected dispute proposals strand the case

**Trigger:** Admin A proposes a resolution above the approval threshold; Admin B rejects it.

**Implemented chain:** proposing creates a PENDING approval and sets the dispute to UNDER_REVIEW ([service.ts:145](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:145)). Rejection changes only the approval to REJECTED and returns; the dispute is not reopened ([service.ts:224](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:224)). The Disputes submit button requires `selected.status === 'OPEN'`, and UNDER_REVIEW displays “Continue in Approvals” ([Disputes.tsx:116](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Disputes.tsx:116)). Approvals fetches PENDING only ([Approvals.tsx:24](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Approvals.tsx:24)).

**Consequence:** the approved rejection is invisible in the console, the remaining dispute points at an empty queue, and neither admin can revise the proposal through the UI. Funds remain frozen until an out-of-band intervention. The backend proposal method can accept an unresolved dispute, but the current UI cannot invoke that path from UNDER_REVIEW; bypassing the UI is not a completed operator flow.

**Smallest addition:** persist/display the latest proposal and its rejection rationale inside the dispute. Add a guarded “Revise proposal” path once the previous proposal is rejected; alternatively atomically restore the dispute to an eligible state. Preserve the prior decision and checker separation. Add deep links between dispute and its exact approval.

**Acceptance:** above-threshold dispute → propose → different admin rejects → maker sees rejected decision → maker revises → second admin approves → case becomes resolved only after execution; refresh/back navigation preserves the handoff. Concurrent competing proposals cannot produce contradictory money actions.

### ADM-02 · P1 · Standalone refunds have an API but no operator entry point

`POST /api/admin/refunds` takes a booking ID, amount and reason ([routes.ts:242](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:242)). No current admin page invokes this endpoint; the six-route inventory and source request callsites were fully reviewed. The only refund entry point on-screen is the outcome of an already-open dispute. The ledger merely displays rows and a UUID filter ([Ledger.tsx:13](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Ledger.tsx:13)); BookingReview is accessible only from Disputes and Approvals.

**Consequence:** support cannot fulfil the PRD’s ordinary “process refunds” requirement through the console when there is no dispute. Copying a booking ID into an external API tool becomes the operational workaround.

**Smallest addition:** searchable booking/payment detail reachable from Ledger, Users and Events; a full-refund action showing recipient, eligible amount, status and reason; explicit below/above-threshold outcome; a persistent receipt linked to the approval or payment operation. An amount input must not imply partial-refund capability: the backend requires the eligible full amount ([service.ts:108](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:108)); the limitation is explicit in [STATUS.md:16](/Users/leslieisah/app-dev/hire-quick/docs/STATUS.md:16).

**Backend dependency:** the request route exists, but safe preflight/lookup and durable operation status need a deliberate API contract. Above-threshold `createRefund` queues a proposal before execution-time full-amount validation ([service.ts:185](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:185)), so simply exposing an arbitrary amount form would create unexecutable approvals.

**Acceptance:** an eligible booking with no dispute can be found and fully refunded; below-threshold execution and above-threshold handoff are distinct; partial/ineligible requests are blocked before proposal; duplicate clicks and timeout reload do not submit a fresh logical refund; pending provider outcome remains pending until verified.

### ADM-03 · P1 · Approval disappears before the money outcome is known

The Approvals screen fetches only PENDING and closes its selected panel on a successful decision response ([Approvals.tsx:25](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Approvals.tsx:25), [Approvals.tsx:39](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Approvals.tsx:39)). The backend commits APPROVED plus an execution intent first, and EXECUTED only after actual completion ([service.ts:235](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:235), [service.ts:293](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/service.ts:293)). Approved work can remain pending and be resumed by the worker ([recovery.ts:25](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/recovery.ts:25)).

**Consequence:** “not in Pending” cannot tell an operator whether the action was rejected, approved-but-processing, failed or executed. Reloading after a lost response is correctly required by the action guard, but the resulting list cannot answer what happened. This is a missing completion/investigation flow, not evidence of absent backend recovery.

**Smallest addition:** status filters and request detail containing maker/checker, decision timestamp, proposed amount/outcome, execution state and original operation reference. Backend already supports APPROVED/REJECTED/EXECUTED list filters ([routes.ts:264](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:264)); operation diagnostics require extending the response. Show “approved, processing” distinctly from “executed”. Keep an unknown-result receipt that can be reopened after refresh.

**Acceptance:** provider timeout after checker commit remains visible in Processing; reload identifies the same request; later recovery moves it to Executed; rejected requests remain searchable; API validation failure differs from uncertain dispatch; nothing invites a second money request to force completion.

### ADM-04 · P1 · Dispute review cannot inspect the full required evidence

The implemented booking review includes amounts, participants, attendance timestamps and dispute notes. It does not include chat history, attachments/photos or the full verification/audit timeline: inspect the complete selector at [routes.ts:198](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:198) and renderer at [BookingReview.tsx:54](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/components/BookingReview.tsx:54). The PRD requires both parties’ evidence, automatically attached chat/photos/verification logs ([PRD:280](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md:280)).

**Consequence:** the action text instructs admins to review each party’s account, but the page cannot supply the promised evidence. A note and arrival timestamps may be insufficient to distinguish no-show, attendance and quality disputes before irreversible financial decisions.

**Smallest addition:** an evidence timeline in case detail, grouped by source/party, with read-only chat and authorized media, submission times and gaps clearly labelled. Keep audit logging and sensitive-media permissions. This requires backend aggregation/media authorization, not only another tab.

**Acceptance:** a synthetic case with conflicting accounts, message evidence, a photo and attendance events renders all authorized evidence in chronological order; unavailable/redacted evidence is explicit; neither party’s submission is silently omitted; unauthorized users cannot access attachments.

### ADM-05 · P1 · Payment exceptions and reconciliation have no console investigation path

The dashboard contains counts and escrow held, not reconciliation status or processing failures ([Dashboard.tsx:15](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Dashboard.tsx:15)); the ledger shows signed entries, not provider/operation state ([Ledger.tsx:44](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Ledger.tsx:44)). The current admin router exposes no reconciliation/operation/withdrawal/checkout exception read endpoint. The worker emits `recon:alarm` and logs drift ([jobs.ts:36](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/jobs/jobs.ts:36)); there is no consumer of that signal in the reviewed admin source. The runbook explicitly says ambiguous refunds may require operator/provider investigation ([OPERATIONS.md:48](/Users/leslieisah/app-dev/hire-quick/docs/OPERATIONS.md:48)).

**Consequence:** an operator can see escrow totals while being unable to discover, identify or track the failure that needs manual attention. An empty pending-approval queue can coexist with an unresolved provider operation.

**Smallest addition:** read-only “Payment exceptions” and last-reconciliation status, with freshness, drift, stale holds, operation age, provider reference, booking/order/user links and escalation notes. Persist/query authoritative results so a transient websocket signal is not the sole source. Keep any recovery controls behind explicit evidence-based backend operations; do not add a generic “retry refund” button.

**Acceptance:** inject a stuck checkout, ambiguous refund, processing withdrawal, approved-but-unexecuted action and stale hold in an isolated fixture; each is discoverable and linked to its case; current/last-check freshness is visible; confirmed recovery clears or resolves the case without duplicating dispatch; no result is labelled healthy merely because the page has no error.

### ADM-06 · P2 · Physical rewards stop at an API-only fulfilment queue

Admin tier CRUD/deactivation is implemented at [routes.ts:357](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:357), and the physical-reward queue/fulfil action at [routes.ts:431](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:431). There is no reward route/nav item or request caller in admin source. The runbook nevertheless tells operators to use “reward screens” ([OPERATIONS.md:86](/Users/leslieisah/app-dev/hire-quick/docs/OPERATIONS.md:86)).

**Consequence:** an earned physical reward cannot be progressed through the console; operations must call APIs externally. This is a concrete gap against implemented product capability and current operating instructions, separate from older PRD roadmap debates.

**Smallest addition:** Rewards → Awaiting fulfilment/Completed, with recipient contact, tier, unlocked date, confirmation and visible fulfiller/time; a separate tier-settings view. Define delivery/contact handling before promising shipment tracking—the current endpoint records fulfilment, not a delivery lifecycle.

**Acceptance:** unlock physical reward → appears once in queue → authorized admin confirms fulfilment → disappears from pending and appears in history → repeat submission cannot duplicate fulfilment; tier deactivation preserves prior unlocks and history.

### ADM-07 · P2 · Account management lacks a case investigation view

Users supports phone/email search, role filter and suspend/reinstate confirmation only ([Users.tsx:13](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Users.tsx:13), [Users.tsx:85](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Users.tsx:85)). The response includes ID, role, phone, email, status, createdAt; no general user-detail endpoint exists in the reviewed admin router ([routes.ts:314](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:314)). Suspension records the mutation but accepts no rationale ([routes.ts:342](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:342)).

**Consequence:** support can remove access but cannot investigate the same person’s verification, jobs, disputes, open balances and prior decisions in one coherent case. The confirmation cannot disclose affected upcoming bookings because that context is unavailable.

**Smallest addition:** read-only User detail linking those records, with a recorded reason for status changes and an explicit impact summary. Treat this as an operational completeness recommendation; the PRD explicitly requires suspend/reinstate, but does not explicitly name a standalone user-detail screen.

**Acceptance:** search by contact → open unique user → follow current booking/dispute/verification → return without losing filters → suspend with reason → history records operator and rationale; existing/upcoming obligations are visible and do not silently disappear.

### ADM-08 · P2 · Verification review ends without history or structured rejection

The pending review itself is present and includes document opening, missing-document blocking, an inspection checkbox and reason. However the screen always requests PENDING ([Verifications.tsx:36](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Verifications.tsx:36)); approved/rejected history is unreachable although the API supports both statuses ([routes.ts:94](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:94)). The reject request sends only free text ([Verifications.tsx:50](/Users/leslieisah/app-dev/hire-quick/apps/admin/src/pages/Verifications.tsx:50)), making the supported reason code default to OTHER ([routes.ts:141](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/admin/routes.ts:141)).

**Smallest addition:** status/search filters, a read-only decision history, exact verification deep links and structured rejection code alongside the explanation. Do not call this a missing verification flow; its core is implemented.

**Acceptance:** approve/reject → locate the exact decision after reload → inspect rationale/status; resubmission remains distinguishable from the previous decision; correct code plus useful user-facing explanation reaches the backend; missing evidence still prevents approval.

## Requirements gaps versus deliberate boundaries

1. **Events oversight is missing from the console against explicit UXRD navigation.** [UXRD:46](/Users/leslieisah/app-dev/hire-quick/documentation/03-HireQuick-UXRD.md:46) names Events. Current event information appears only within a disputed/approval booking. A minimal Events search/detail with roster and linked bookings would enable ordinary support before a dispute exists. There is no dedicated event-management endpoint in the reviewed admin router; evaluate existing shared event reads before designing a new admin read contract. This finding does not recommend giving admins client-only creation/cancellation powers.
2. **Reports/analytics and category management are stated requirements with no corresponding destination.** [PRD:189](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md:189) names both; the current dashboard’s counters are not filtered reports. Define the required launch reports and minimum category controls, or explicitly revise the specification. Additional staff categories are V2 ([PRD:332](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md:332)), so a full category expansion suite is not automatically a launch blocker.
3. **Partial refunds and late-cancellation split settlement are backend boundaries, not missing form fields.** [STATUS.md:15](/Users/leslieisah/app-dev/hire-quick/docs/STATUS.md:15) and [PAYMENTS.md:369](/Users/leslieisah/app-dev/hire-quick/docs/PAYMENTS.md:369) explicitly document the gap. A support queue should acknowledge the case and escalate it; an admin amount box cannot safely emulate unsupported settlement.
4. **Post-payout dispute handling is blocked pending clawback/debt support.** [STATUS.md:17](/Users/leslieisah/app-dev/hire-quick/docs/STATUS.md:17). Design a support intake/status path if required, but do not represent it as an immediately executable escrow resolution.
5. **Emergency replacement, saved favourites, agency/corporate accounts and expansion are explicitly deferred.** [PRD:330](/Users/leslieisah/app-dev/hire-quick/documentation/02-HireQuick-PRD.md:330). They should not inflate the launch missing-screen count.

## Recommended minimum sequence

1. Repair rejected-dispute revision and approval execution visibility together; these are the two broken endings of the same maker-checker flow.
2. Add general booking/payment detail and full-refund initiation, reusing the existing review content and linking every outcome to a durable case.
3. Add dispute evidence and read-only payment-exception/reconciliation investigation. Complete the operator path without weakening payment guards.
4. Add reward fulfilment, account detail and verification history; reconcile the runbook’s existing-screen claims.
5. Confirm the exact Events, Analytics and Categories launch scope and update the product specification accordingly.

Validation remains to be run against synthetic fixtures or an authorized isolated environment. No real customer records, money operations, document approvals or account suspensions were changed during this review.
