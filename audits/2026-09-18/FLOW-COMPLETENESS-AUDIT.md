# HireQuick flow completeness audit

18 September 2026 · Application baseline `8fa28a4` · Direction: calm, trustworthy, mobile first

## Conclusion

HireQuick has much of the ordinary booking path, but the experience is not yet complete across recruitment, event-day exceptions, money follow-up and operational handoffs. The main work is to connect actions and expose authoritative lifecycle states. A collection of additional isolated forms would leave many of these problems unresolved.

There are genuine missing screens: booking history/detail for ushers, participant dispute case detail, withdrawal/refund tracking, account/privacy settings, and general admin booking/payment investigation. Other gaps belong inside existing screens: a functioning Invite action, self-arrival, client visibility of that arrival, role-correct cancellation, rate-client, verification return routing, truthful staffing counts and approval history.

Keep the calm visual direction. The next design pass should be organized around complete journeys, with a clear answer at each step to: what happened, who acts next, and where the money is.

## What was examined

- Complete inventory of **44 mobile route files**, excluding layouts. This includes the index, not-found route and legacy KYC redirect; it is not a claim that there are 44 independent product screens. Route references were checked against handlers and shared navigation components.
- **Seven admin page entries:** login and six authenticated destinations. All registered admin destinations and corresponding operator capabilities were reviewed.
- Client, usher, admin and shared account/communication journeys against PRD v2.1, UXRD v2.1 and relevant backend requirements. Current limitations in `docs/STATUS.md` were treated as explicit boundaries, not ignored in favor of old promises.
- Backend route/service support for material missing actions, including recruitment, booking attendance/cancellation/reviews, disputes, withdrawals, admin approval execution, privacy and notifications.
- Independent client, usher and admin assessments, followed by cross-review and a skeptical check of the shared/usher findings.
- Local browser interaction with the real admin frontend and an isolated sample-data API: login, dashboard, dispute review, approval review and ledger. No real account, document decision, payment, refund or suspension was executed.
- Pure extracted-source probes reproduced the withdrawn badge exception and the cancellation-timezone disagreement. These are logic probes, not rendered native or database/provider integration tests.

**Evidence boundary:** the source assessment is complete for the enumerated journeys and inspected scopes. End-to-end UX acceptance remains **Incomplete**. There was no native device walkthrough, background-push test, two-person live approval execution or real payment-provider round trip. No application code was changed in this pass.

## Flow-by-flow map

“Present” means a source-supported path, not a live certification. Findings and acceptance criteria are expanded in the linked role reports.

| Flow | Current state | Missing step or correction | Evidence IDs |
|---|---|---|---|
| Sign up / return | OTP and role routing present | Durable profile-completion checkpoint; inactive-account/support state | SHR-01, SHR-09 |
| Client profile | Initial setup present | Edit account; inert settings/notification rows | SHR-02 |
| Privacy and preferences | APIs present | Read policy, acknowledgement, consent, export, erasure journey | SHR-03 |
| Usher profile setup | Profile/media/edit present | Initial language choices are discarded | U09 |
| ID verification | Upload, pending, reject/resubmit present | State-aware return to current submission; explicit status refresh | U10 |
| Client discover → invite | Discovery and profiles present | Invite currently only shows a message and goes back; add event picker/send | C01 |
| Client sent invitations | Accepted reply becomes application | Sent/accepted/declined tracking and return to checkout | C02 |
| Usher job discovery | Available/applied/saved present | Date/budget narrowing, coarse-location contract, client reputation | U11 |
| Applications | Apply, shortlist/reject, batch selection present | WITHDRAWN exception; accepted ≠ funded; remaining capacity/eligibility | U02, U03, C06 |
| Recruitment return | Invitation deep link present | Invitations list, eligible withdrawal, accepted unpaid basket | U12, C07 |
| Create event | Validated steps and cost review present | Date horizon requires an explicit contract | Client additional details |
| Event management | Pre-booking edit present | Whole-event cancellation; close recruitment; safe slot changes; duplicate | C03, C04 |
| Staffing progress | X-of-N UI present | Count confirmed/reserved/vacated separately | C05 |
| Checkout / uncertain payment | Durable original checkout and status recovery present | Direct support handoff for REVIEW; operator investigation | Client additional details, ADM-05 |
| Usher confirmed/past jobs | Some home rows and check-in context | Active/past list and booking detail with all terminal branches | U04 |
| Host-code attendance | Code generation, expiry, entry and release confirmation present | Preserve this path; native round trip still to test | Client positive evidence, usher matrix |
| Passive-host attendance | Arrival/auto-complete backend present | “I've arrived”; visible client claim/time/deadline; report-problem path | U01, C09, C08 |
| Calendar | Availability and booking locks present | Link occupied dates to associated work | U04 |
| Client booking cancellation | Full-refund route present | Lagos quote mismatch; truthful processing-fee and late-policy copy | C10, C11 |
| Usher booking cancellation | Backend present | Discoverable action and usher-specific policy/outcome | U05 |
| Refund follow-up | Provider-aware backend handling present | Durable pending/refund case, reference, outcome and escalation | C11, ADM-02 |
| Open/respond to dispute | Reason/note form and freeze operation present | Reachable entry; participant case API, evidence exchange, case outcome | C08, C12, U06 |
| Post-payout dispute | Documented backend limitation | Product/settlement decision; truthful support intake meanwhile | C12, U06, STATUS |
| Reviews | Client-to-usher form; two-way backend | Named pending/completed queue, rate-client, submitted state | C13, U07 |
| Wallet / bank withdrawal | Balance separation, bank resolution, safe retry/receipt present | Authoritative subsequent status and complete withdrawal history | U08 |
| Reliability | Summary number/reviews present | Incident explanation and links to affected jobs | U14 |
| Messages | Text, booking context, failed-send retry present | Media/voice, unread/read state, truthful safety copy, archived read-only history | SHR-07, SHR-08 |
| Notifications | Inbox/polling and some lifecycle records present | Device opt-in/registration; catalogue completion; actionable targets | SHR-04–06 |
| Admin identity review | Pending review with evidence safeguards present | History, exact decision links and structured reject reasons | ADM-08 |
| Admin disputes | Open case proposal and booking summary present | Full evidence; rejected-proposal revision | ADM-01, ADM-04 |
| Admin approvals | Pending checker review present | Approved/processing/executed/rejected history and durable outcome | ADM-03 |
| Admin support refund | Creation API present | General booking lookup, eligible quote, initiation and receipt | ADM-02 |
| Admin money investigation | Ledger/worker/runbook present | Exception queue, reconciliation freshness, provider references | ADM-05 |
| Admin account/event support | User search/status mutation; incidental event context | User case detail and event/roster investigation | ADM-07, admin requirements gaps |
| Rewards | Backend tier/fulfilment capabilities present | Operator queue/history; reconcile current runbook promise | ADM-06 |
| Reports/categories | Stated product requirements | Define minimum launch scope/API/read model or revise spec | Admin requirements gaps |

## Highest-priority breaks

1. **Proactive hiring is disconnected.** The Invite button sends no invitation, even though invitation creation and usher response exist on the server. A client with no applicants cannot complete the intended alternative hiring path. Add event-scoped invite selection/send and the corresponding sent-invitation state together. [C01–02](client-flow-review.md)
2. **Recruitment states are unsafe to interpret.** An accepted unpaid application says “Booked”; withdrawn applications can fail rendering; selection uses total headcount rather than remaining capacity; event progress counts unpaid/refunded rows as confirmed. The backend guards protect payments, but the UI sends users toward rejected or misleading actions. [U02–03](usher-flow-review.md), [C05–07](client-flow-review.md)
3. **The passive-host attendance guarantee is not usable from mobile.** The server implements self-arrival, but ushers have no action to invoke it. If arrival is recorded through another client/API, the client roster does not show the claim, despite its eventual auto-completion consequence. Ship self-arrival, client claim visibility and dispute recourse as one complete journey. [U01](usher-flow-review.md), [C08–09](client-flow-review.md)
4. **Changing plans does not have a complete outcome.** Whole-event cancellation is absent; the shared cancellation sheet is client-specific; the financial preview uses an instant one hour later than settlement; pending refunds look like generic failure; late split settlement is not actually supported by the current money implementation. [C03–04, C10–11](client-flow-review.md), [U05](usher-flow-review.md)
5. **Disputes stop at a form.** That form has no normal app entry, no participant evidence exchange or persistent case detail. Admin review also lacks the promised chat/media evidence. Post-payout disputes require backend policy/settlement work before the documented promise can be fulfilled. [C08, C12](client-flow-review.md), [U06](usher-flow-review.md), [ADM-04](admin-flow-review.md)
6. **Money follow-up is missing after the initial response.** A processing withdrawal does not have a durable status/history page; a pending refund lacks a customer case; admin approved-but-unexecuted work disappears from the only approvals queue. Existing safe retry and background recovery are valuable, but users cannot reliably see the eventual result. [U08](usher-flow-review.md), [C11](client-flow-review.md), [ADM-03, ADM-05](admin-flow-review.md)
7. **Rejected admin dispute proposals leave a dead end.** Rejection removes the pending approval while leaving the dispute UNDER_REVIEW; the case instructs the operator to continue in Approvals, and its resubmit action is restricted to OPEN. Add rejected-decision visibility and guarded revision, retaining maker/checker separation. [ADM-01](admin-flow-review.md)
8. **Account and communication promises are not reachable.** Privacy/data APIs are not exposed in mobile, client settings are placeholders, and normal installs cannot opt in/register for background notifications. Several lifecycle notices and deep links are also absent. [SHR-02–06](shared-flow-review.md)

No P0 is asserted from this evidence. P1 denotes an important launch journey being blocked or a materially misleading attendance/money state, not a claim of proven production loss.

## The smallest coherent screen plan

These are screen families; several can be sheets or sections within existing routes. Do not turn every audit finding into another standalone page.

| Addition / extension | Entry points | Must contain | Dependency |
|---|---|---|---|
| **My bookings + booking detail** | Usher Home, Jobs, Calendar, Profile, notification | Active/past states, correct event/person, held/net/released money, attendance timeline, permitted actions, retained chat | Existing booking reads; extend status/review/case fields as needed |
| **Invite to event + invitation status** | Staff profile, event staffing, no-applicant state | Eligible event picker, create-event return, send/pending/accepted/declined, named staff | Create/respond API exists; client sent-invitation read contract needed |
| **Event management extensions** | Client event detail | Close recruitment, safe slots/editing, duplicate, whole-event cancellation preview/outcome | Lifecycle and capacity contracts; coordinated cancellation workflow |
| **Cancellation/refund receipt** | Booking/event detail, support, notifications | Role-correct authoritative quote, request accepted vs failed, pending/result/reference, support escalation | Quote/status API; split settlement remains a separate backend project |
| **Dispute case detail** | Report problem, booking history, notification | Reason, evidence from both parties, case timeline, next action, financial outcome | Participant read/evidence API and admin evidence aggregation |
| **Withdrawal detail/history** | Wallet activity, latest receipt, notification | Server status, amount/bank/reference, pending/paid/failed/reversed, pagination | Owned list/detail read API; retain existing idempotent request store |
| **Account / Privacy & data** | Both profiles; policy accessible pre-auth | Client edit, policy/version, consent/preferences, export/erase, account-help | Existing partial APIs; safe erasure/export presentation and lifecycle |
| **Admin booking/payment case** | Ledger, Users, Events, Disputes, Approvals | Searchable subject, money/attendance/evidence, eligible refund initiation, linked durable operation | Existing BookingReview reuse plus lookup/preflight/status aggregation |
| **Admin history and exception views** | Dashboard, Approvals, Verifications, payment case | Rejected/revisable/approved-processing/executed decisions; exceptions, last-check freshness, references | Some status filters exist; durable diagnostic read APIs needed |

Extend existing check-in, event-day, review, verification and chat screens for their missing actions. Rewards fulfilment and the exact Analytics/Categories scope follow after the core financial and attendance journeys are complete or are explicitly included in the launch contract.

## Recommended implementation order

**1. Repair incorrect states first.** WITHDRAWN rendering, accepted-versus-funded language, capacity/count contracts, cancellation timezone/fee copy, profile language persistence and rejected approval handoff. These prevent obvious errors while larger screens are built.

**2. Complete recruitment and the booking hub.** Wire invitations through acceptance/payment, preserve the accepted unpaid basket, build the usher active/past booking view and reusable role-aware booking detail. That provides a stable home for later actions and history.

**3. Complete attendance and recourse together.** Self-arrival → client claim visibility → verify or dispute → completion/release → named review. Connect role-specific cancellation and persistent case/refund outcomes. Resolve post-payout and late-cancellation policy limits before promising support can execute them.

**4. Make all money outcomes inspectable.** Withdrawal history, refund tracking, admin case/refund initiation, approval execution history and exceptions/reconciliation. Preserve the existing checkout and withdrawal idempotency/recovery implementation.

**5. Finish account and communication support before launch acceptance.** Onboarding resume, privacy/consent, client editing, background notifications and targets, verification return states, chat/media/archive, two-way review completion. Then address remaining discovery, reliability, reward and reporting scope.

## Acceptance journeys to run on an isolated environment

1. New client and usher: OTP → close app before profile save → reopen → finish intended profile → correct role home.
2. Verified usher: pending/rejected/approved verification returns, permission denial, upload failure and resubmission without duplicate confusing states.
3. Client has zero applicants: browse → invite → usher responds → client sees reply → same staff enters unpaid basket → checkout funds booking.
4. Apply → receive invitation → decline → return to Applied; every application state renders safely.
5. Partly staffed event: select only remaining eligible staff; withdraw/change eligibility concurrently; retain valid choices and correct progress.
6. Close payment browser or lose response: resume the same logical checkout, never claim paid from browser close, preserve REVIEW and support reference.
7. Passive host: usher asserts arrival → client sees claim/time → client verifies or raises eligible dispute → appropriate completion/release outcome; no-show exclusion verified server-side.
8. Cancellation just before/at/after 48h and 12h in differing device timezones; both roles see the same policy outcome as settlement. Repeat across empty/partial/full events and pending provider response.
9. Either participant submits/responds to a dispute with text/photo/chat evidence → operator reviews both → decision → authoritative financial result remains discoverable.
10. Two admins: propose above threshold → checker rejects → maker revises → checker approves → timeout/reload → processing remains visible → execution completes once.
11. Withdraw → pending → Done/restart/another device → paid/failed/reversed; inspect older history and restored balance without submitting another withdrawal.
12. Multiple paid bookings: client reviews each named usher, usher reviews correct client, completed reviews stay completed after relaunch.
13. Background notification permission granted/denied/revoked; actual device receives correct lifecycle event; cold-start tap opens exact authorized target.
14. Cancel/refund a booking with prior chat; retained history remains discoverable, compose eligibility is correct, evidence stays accessible under retention rules.
15. Privacy policy/acknowledgement, independent consents, export retrieval, erasure preconditions/outcome, restricted account and support access.

These are acceptance criteria, not claims that those tests have passed.

## Keep and clarify

**Keep:** validated event creation, transparent client totals, durable checkout recovery, separate held/available wallet balances, bank resolution and safe withdrawal retry, manual verification/rejection flow, availability locking, expiring named check-in codes and explicit release confirmation. The previous UI improvements are useful foundations.

**Resolve requirements drift explicitly:** OTP-only versus old password requirements; optional QR versus sufficient OTP; 60-day date picker horizon; post-payout dispute eligibility; late cancellation split settlement; processing-fee deductions; reports/categories launch scope. Saved favorite staff, emergency replacement recommendations, agency/corporate accounts and geographic expansion are already deferred and are not counted as missing launch flows.

## Detailed evidence

- [Client journey review](client-flow-review.md): 13 prioritized findings, creation-to-review branches, backend restrictions and acceptance criteria.
- [Usher journey review](usher-flow-review.md): recruitment, confirmed work, attendance, wallet, reputation and return paths.
- [Admin operational review](admin-flow-review.md): maker/checker endings, refunds, evidence, exceptions and operational scope.
- [Shared account/communication review](shared-flow-review.md): onboarding, privacy, settings, notification and chat recovery.
- [Route inventory](evidence/route-inventory.json): every non-layout mobile route and literal inbound references, with dynamic-routing caveat.
- [Admin interaction manifest](evidence/admin-interaction-manifest.md): actual actions, timestamps, observed destinations and limits.
- [Independent skeptical review](evidence/self-critique.md): evidence, scope and severity corrections applied.
- [Source logic probe results](evidence/source-probes.json): cancellation boundary mismatch and WITHDRAWN badge exception.

Graph-first discovery used the current repository index, exact-path/scope coverage checks, complete relevant pagination and direct source reads for material claims. The dispute modal’s known parse gap at line 68 was read directly. Index generations advanced from `2026-09-18T18:23:11Z` as audit artifacts were added; assessments record their generation. A clean coverage result is best-effort metadata, not proof of semantic completeness. No staging/native pass, performance verdict or visual re-score is inferred from this flow review.
