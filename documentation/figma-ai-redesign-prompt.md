# HireQuick — complete frontend redesign prompt

Design scope verified against the current local frontend on 24 September 2026. This is a redesign brief for implemented surfaces, not a claim that every integration has been tested live or deployed. Paste this document into your Figma AI conversation, or attach it and ask the AI to execute the brief.

---

You are a senior product designer designing the complete HireQuick experience in Figma. Use the connected design tools to create editable, high-fidelity screens, a coherent component library, and connected prototypes. Produce the actual designs, not just a written proposal.

## 1. What we are designing

HireQuick is a mobile-first event-staffing marketplace launching in Lagos, Nigeria. Event organisers hire verified ushers and event staff. Ushers find jobs, manage availability, coordinate with clients, record attendance, and withdraw earnings. An operations team manages identity reviews, bookings, disputes, approvals, and payment issues.

Design these surfaces as one brand:

- **Client mobile app:** finding and booking staff, managing events, coordinating the event day.
- **Usher mobile app:** finding work, building a professional profile, managing bookings and earnings.
- **Admin web console:** operations, identity review, support, and financial oversight.
- **Public marketing website:** explaining the product and directing organisers and workers toward signup.

The mobile app is implemented with Expo React Native; admin and marketing are React websites. Design native-feeling mobile interactions and responsive web layouts that can be implemented with those technologies.

This is a full visual redesign. Improve hierarchy, spacing, typography, composition, navigation clarity, and interaction quality while preserving the capabilities and business rules below. Each inventory item needs a corresponding design. Some routes have several steps or states; design those separately. Shared screens need client and usher variants where their content or actions differ.

## 2. Creative direction

Make HireQuick feel desirable, confident, contemporary, and beautifully crafted: a premium staffing brand with the energy of Lagos events and the clarity needed when real money and work are involved.

Aim for strong typography, excellent portrait and event photography, purposeful contrast, generous but efficient spacing, crisp icons, and a few distinctive brand moments. Let people and events give the product its personality. Financial and operational screens should feel calm, precise, and trustworthy.

Existing brand context:

- The current marketing direction is bold and people-focused, with charcoal, white, and yellow. Use this as the starting palette for a unified proposal; the exact colour values are open to refinement.
- Previously supplied reference directions include Qwick, Wonolo, Shiftsmart, and MIRA Event Support. Treat these as category inspiration, not layouts to copy.
- Use the supplied official HireQuick logo. If it is unavailable in the design session, use a clearly labelled logo placeholder until the asset is supplied. Do not invent a replacement symbol.
- Avoid the previously rejected emerald-and-cream editorial website direction, decorative serif headlines, and arched photos.

Give the app its own considered visual identity. Avoid generic dashboard templates, identical cards around every element, excessive pills, decorative gradients everywhere, glass effects, and oversized headings that crowd out useful information. Marketing can be expressive; forms, chat, attendance, and payments must be efficient.

Use realistic fictional Nigerian names and event content. Show a credible mix of weddings, corporate events, private parties, and brand activations. Use ₦ amounts, Nigerian phone formatting, and Lagos event times labelled WAT where ambiguity matters. Do not imply nationwide supply, guaranteed job availability, guaranteed earnings, or public app-store availability.

Use one coherent sample journey across screens: an organiser staffing a six-person wedding in Victoria Island at ₦20,000 per person. The full six-person budget is ₦120,000; a batch of four selected staff costs ₦80,000. Each ₦20,000 booking has a ₦3,000 commission and ₦17,000 net usher earnings. Keep counts and amounts consistent as the journey progresses.

## 3. Navigation and product rules

**Client bottom navigation:** Home · Discover · Events · Messages · Profile.

**Usher bottom navigation:** Home · Jobs · Messages · Wallet · Profile. Availability Calendar is an additional screen reached from Home and Profile; it is not currently a sixth tab or a replacement for Messages.

**Admin navigation:** Dashboard · Verifications · Disputes · Approvals · Bookings & refunds · Payment operations · Escrow ledger · Users. Login precedes the authenticated console.

Preserve these rules in every design:

1. Events have multiple staff slots. Show required, selected/reserved, confirmed, and remaining counts accurately. “Four selected” is not “four confirmed.”
2. Applying, shortlisting, or accepting an invitation does not confirm a paid booking. Confirmation requires the client’s payment to be received and the bookings confirmed.
3. The client pays the event budget per person multiplied by the number being booked. The 15% commission is deducted from the usher’s allocation, never added to the client’s total.
4. An usher’s displayed day rate is indicative. The event’s agreed budget controls this booking’s price.
5. Keep these states distinct: client payment received → funds held → attendance recorded → work completed → funds released to wallet → withdrawal to bank.
6. Completing a booking does not immediately make earnings withdrawable. Eligible completed bookings can release no earlier than **72 hours after the scheduled event end**, with no unresolved dispute. Show the earliest release date/time; do not promise an instantaneous release or bank transfer.
7. Eligible bookings with verified attendance or reported arrival can complete automatically after the event-end grace period, currently 60 minutes, unless a dispute is open. This does not shorten the 72-hour hold.
8. Client cancellation refunds are 100% more than 48 hours before the event; 50% from 12 through 48 hours inclusive; 0% below 12 hours. Commission applies within the remaining usher allocation. No processing fee is deducted from the client refund. Usher cancellation and no-show use the full-client-refund policy. Display the returned quote and applicable approval status before confirmation.
9. An eligible dispute freezes held funds. A decision favouring the usher before the release deadline does not remove the remaining hold.
10. Booking chat becomes available after confirmation, with access subsequently governed by booking state. It is a conversation for a specific booking, not an unrestricted direct-messaging network.
11. Verification is required before an usher can apply and be discoverable. Pending users can browse while waiting. Account role changes require support.
12. Never turn a failed balance fetch into “₦0”, a failed list fetch into “no results”, or an uncertain payment into success or definitive failure. Preserve the original transaction and give a clear recovery action.

If older copy conflicts with these rules, use these rules in the redesign. Do not copy outdated promises that money releases immediately after check-in or that no money left an account merely because checkout failed.

## 4. Mobile screen inventory

The following covers **51 implemented screen routes**, excluding navigation layouts, the entry redirect, and the old consent route that now redirects to identity verification. It requires more than 51 frames because several routes contain multi-step flows and shared role variants.

### A. Account access — 5 routes

**A01 — Welcome.** Brand introduction, staffing proposition, Get started, existing-account sign-in, and Privacy policy. Show the client and worker value clearly without making this a long marketing page.

**A02 — Choose role.** “I’m hiring staff” and “I’m an usher”, with concise explanations, selected states, and Continue. Explain that changing roles later requires support.

**A03 — Phone entry.** Nigerian country code, phone input, validation, send-code action, and sending/failure states. Existing-account sign-in uses this flow too.

**A04 — Verify OTP.** Six-digit code entry, masked or contextual phone display, resend countdown, resend feedback, verifying, incorrect/expired code, and recovery. Exclude development-only test-code UI.

**A05 — Complete client profile.** Full name and optional business name, validation, save progress, and Continue. Usher onboarding continues into B01.

### B. Usher onboarding and verification — 4 routes

**B01 — Profile setup.** Headshot upload, full name, years of experience, bio, languages, and work photos. Include photo selection/upload progress, failure/retry, and successful preview. Work portfolios support up to five photos.

**B02 — Identity verification.** Given names, surname, optional email, NIN/BVN selection, 11-digit identity number, privacy explanation, and Continue with Smile ID. Include connecting, validation, provider failure, cancelled capture/retry, and a web fallback directing the person to the installed mobile app. Show the handoff to the provider’s camera/selfie/consent experience; provider-controlled screens should be labelled external rather than redesigned as proprietary HireQuick screens.

**B03 — Awaiting approval / verification status.** Submitted, under review, approved, incomplete identity check, and failed status fetch. Include Check latest status, Return to identity check when relevant, Contact support, Browse jobs while you wait, and Start applying after approval.

**B04 — Verification rejected.** Clear reason, correct-and-retry guidance, verification retry, and support.

The old standalone KYC consent route is a redirect. Do not invent a second consent journey; biometric consent belongs to the Smile ID flow.

### C. Client main screens — 6 routes

**C01 — Home.** Personal greeting, unread notifications entry, Create event and Browse staff actions, recent events with staffing progress, and suggested verified staff.

**C02 — Discover staff.** Search, quick filter chips, active filter count, staff results, refresh, and no-match/error/stale-results states. Cards show portrait, name, verification, rating, completed jobs, location, and indicative day rate or “Rate on request”.

**C03 — Events list.** Event cards, dates, staffing progress and status, event creation entry, and first-event empty state.

**C04 — Event management detail.** Title/category, schedule, location/state, staffing counts, budget per head, total estimated budget, dress code and requirements. Entries to applications, sent invitations, bookings, editing when allowed, and event-day attendance. Cancellation is currently per booking. Any “Message all” affordance leads to conversations; do not imply a working group broadcast feature.

**C05 — Messages.** Booking-based conversation list showing the other participant, event context, booking state, and unread count. Include locked/no-confirmed-booking explanation and refresh failures.

**C06 — Client profile.** Name, phone, role, My bookings, Account settings, Notifications, Help & support, and sign-out confirmation/progress.

### D. Usher main screens — 6 routes

**D01 — Home.** Greeting, notifications, verification reminder when relevant, available wallet balance, held earnings, earnings context, upcoming jobs and their next actions, and availability-calendar entry.

**D02 — Jobs.** Available, Applied, and Saved views; job cards with event title, per-head pay, date, venue, dress/category, saved state, application/booking status, and View action. Include My bookings & history entry, application awaiting client payment, empty saved/applied lists, and failed refresh.

**D03 — Availability calendar.** Month navigation, available/unavailable/unset dates, dates locked by confirmed jobs, legend, selected states, saving/error recovery, and opening the booking on a locked date.

**D04 — Messages.** The shared conversation pattern with client identity and event context from the usher’s perspective.

**D05 — Wallet.** Available balance, pending held earnings, next eligible release date when known, lifetime earnings, recent credits/debits, Withdraw to bank, and withdrawal-history entry. Use unmistakably different treatments for held and available money.

**D06 — Usher profile.** Portrait, verification status, bio, rating, completed-job count, reliability, upcoming bookings, work photos, and recent reviews. Entries to edit profile, bookings, settings, invitations, availability, wallet, verification when needed, and sign out. Show how late cancellation/no-show affects standing without using punitive visual language.

### E. Event creation, recruitment and checkout — 13 routes

**E01 — Staff profile.** Portrait, verification and reputation, bio, work-photo gallery, years of experience, location, languages, indicative rate, rating breakdown, and reviews. Invite is the primary action. Messaging is available only through an eligible existing booking; provide a clear explanation otherwise.

**E02 — Discover filters.** Availability today/any time, location, minimum rating, maximum indicative day rate, reset, and result-count/apply action. Do not add unsupported demographic or map-distance filters to the current scope.

**E03 — Invite staff to an event.** Selected usher context, eligible upcoming events with open slots, event selection, send invitation, success/error, and an empty state linking to event creation.

**E04 — Invitations list.** Client sent-invitations variant scoped to an event; usher received-invitations variant. Show response statuses and relevant profile/detail actions. Clients can continue accepted invitations into selection/payment.

**E05 — Invitation detail.** Event and organiser information, pay, schedule, requirements, invitation status, Accept/Decline, submitting/result states, and withdrawal of acceptance when permitted. Explicitly explain that acceptance still needs the client’s payment.

**E06 — Create event, three steps.** Step 1: event title, venue, state, date, start/end times, category. Step 2: headcount, budget per person, optional dress code and hairstyle, accommodation, and extra requirements; show the calculated total. Accommodation selection is required for events ending at or after 10 PM. Step 3: review details and publish. Include progress, back navigation, validation, and submission failure. Creation publishes an open event; no checkout happens here.

**E07 — Event published.** Success with event context, View event and Back to home. Avoid promising a particular response time or guaranteed applicants.

**E08 — Edit event.** Existing editable event details, staffing budget, accommodation, hairstyle and requirements, save feedback, and the locked state when confirmed staffing prevents editing. Do not imply that a confirmed event can be freely changed.

**E09 — Applications and selection.** Applicant cards with photo, verification, rating, completed jobs and experience; View profile, Shortlist, Reject and multi-select. Show slots needed, selected count and batch cost. Prevent selection beyond remaining capacity. Include accepted/pending-payment, rejected/unavailable, partial selection and saved-checkout recovery states.

**E10 — Confirm & pay.** Event summary, selected staff, quantity × per-head price, informational 15% fee paid by staff, exact client total, Paystack handoff and resume-original-checkout action. Include changed-selection, unavailable-payment and failed-summary states. The current screen does not expose a payment-email editing field; keep provider details in the handoff unless an addition is explicitly proposed.

**E11 — Payment status / funds held / checkout recovery.** Design variants for checkout saved, starting payment, ready to resume, payment awaiting investigation, reservation expired, payment received and bookings confirmed, late-payment refund pending, and refund completed. Show amount, order reference, refresh/check status, resume when allowed, and leave/check later. Browser dismissal must not look like a cancelled or failed payment. Late payment after reservation expiry must not show the staff as confirmed.

**E12 — Payment failed.** Failure explanation, retry and back actions. Avoid unsupported statements about whether the bank debited the user; distinguish a known failure from an unknown transaction outcome.

**E13 — Job details for ushers.** Event title/category, per-head budget and net-earnings context, date/time, venue as permitted, state, dress code, hairstyle when specified, remaining staff slots, requirements, and client context. Save/unsave and Apply actions with progress, success and rejection feedback. Explain verification, availability, closed-event or capacity restrictions when they prevent applying. This is distinct from the client's event-management screen.

### F. Bookings, attendance, communication and resolution — 8 routes

**F01 — My bookings.** Active and History views, event/person context, booking status and amount, detail navigation, and review entry when eligible. Include both client and usher variants and event-scoped lists.

**F02 — Booking details.** Event, counterpart, schedule, venue or pre-payment restricted venue, gross booking amount, net earnings for ushers, booking and payment state, earliest wallet release, and booking reference. Present only eligible actions: resume checkout, check-in, report arrival, confirm work completed, chat, cancellation, dispute, review, and support. Include cancellation quote/outcome/status, refund tracking, dispute case status/reference/resolution, and a submitted-review state.

**F03 — Client event-day roster.** Staff list, confirmed/checked-in progress, per-person attendance, Generate code and displayed six-digit check-in code, reported arrival, Complete work confirmation, cancellation, ratings when eligible, and booking/dispute links. Explain the automatic-completion grace period and continued earnings hold. Include an out-of-date roster state that asks for refresh before consequential actions.

**F04 — Usher check-in.** Event context, six-digit code entry, validation, checking, invalid code, not-yet-eligible, already checked-in, completed-but-held, and released-to-wallet variants. Connect to the separate “I have arrived” action in Booking details for reporting arrival when the host is unavailable.

**F05 — Booking chat.** Participant/event header, messages, timestamps, text composer, photo attachment, unread/read context where supported, safety notice for off-platform contact/payment sharing, sending, delivery-unconfirmed/retry, history refresh, and attachment loading/retry. Explain that shared conversation photos are visible to both participants and available for case review. Voice recording and in-app voice playback are not a complete current feature; do not add them as core controls.

**F06 — Cancellation.** Booking/person/event context, reason/outcome explanation, exact client refund, gross usher allocation, commission, net compensation, and no processing deduction. Include approval-required, pending/uncertain, no-longer-cancellable, support-required, confirmed result and Keep booking states. The user sees the financial consequence before committing.

**F07 — Open a dispute.** Client reasons: no-show, late arrival, conduct/presentation, other. Usher reasons: attendance/payment, unsafe conditions, client conduct, other. Add a written explanation, attached chat/attendance evidence notice, submit progress, confirmation and error. Case tracking lives in Booking details. The current dispute form has no separate photo uploader; photos can be shared in booking chat.

**F08 — Review counterpart.** Client rates usher; usher rates client. Five-star selection, optional comment, submit/skip, pending/error, and already-submitted display. The current UI opens reviews after payout release; show the locked state earlier.

### G. Account, notifications and withdrawals — 8 routes

**G01 — Notifications.** Read/unread rows, timestamp and category cues, Mark all read, empty/error states, and deep links to the relevant event, invitation, booking, payment or withdrawal.

**G02 — Account settings.** Signed-in phone, client full/business-name editing, usher Edit profile entry, Privacy & data and Privacy policy, save success/error.

**G03 — Edit usher profile.** Display name, bio, state, base area, languages, indicative day rate, years of experience, save and validation. Profile and onboarding already provide photo management; keep those entry points coherent.

**G04 — Privacy & data.** Consent toggles for push notifications, marketing email and SMS; saving/error states; Export my data with preparing/share states; account erasure explanation and typed ERASE confirmation; blocked erasure when financial or booking obligations need resolution; privacy-support entry. Device notification permission is separate from account consent.

**G05 — Withdraw to bank, multi-step.** Available balance, saved-account selection, amount input, Withdraw all, and Add bank account. Bank search/select, 10-digit account number, resolved account-name preview, lookup progress/failure/retry, and save. Review step shows amount, destination and remaining balance before confirmation. The current flow shows no withdrawal fee. Receipt/status must reflect the recorded outcome, including processing, success, failure and uncertainty, with tracking entry. Recover a saved attempt before permitting another withdrawal.

**G06 — Withdrawal history.** Transfer amount, state, destination context and date; newer/older pagination, empty/error states, and detail entry.

**G07 — Withdrawal details.** Amount and status, account name and masked account, requested/updated dates, refresh latest status, outcome explanation and support.

**G08 — Privacy policy.** Scrollable policy body, version and effective date, readable document hierarchy, load error, and signed-in acknowledgement/pending/acknowledged states. Legal text is supplied content, not invented design copy.

### H. Recovery — 1 route

**H01 — Page not found.** Clear explanation and a useful route back into the app.

## 5. Admin console — 9 screens plus review states

Create a desktop-first console at 1440px with tablet and narrow-screen adaptations. Prioritise scanability, readable tables, persistent filters, a clear selected record, and case review beside the supporting evidence. Use the same brand foundations with quieter visual treatment.

**AD01 — Admin login.** Admin email → email OTP, resend, change email, expired/incorrect code, loading, and authentication errors. Do not use the mobile phone-login design here.

**AD02 — Dashboard.** Pending verifications, open disputes, pending approvals, total users, escrow held, and approval threshold. Link counts into the corresponding work queues. Do not invent revenue charts, analytics datasets or editable threshold settings.

**AD03 — Identity verifications.** Queue, record review, submitted date, identity method, and approve/reject with a meaningful rejection reason. For legacy uploaded submissions show ID/selfie evidence and unavailable-preview states. For Smile ID submissions show job/result context and an external provider-dashboard link; do not fabricate stored biometric previews. Include evidence-reviewed confirmation, submitting, stale-result and uncertain-action states.

**AD04 — Disputes.** Queue and case review with booking, parties, attendance, reported arrival, completion, money state, notes, retained chat and attachments. Decision options: award to usher, with the hold deadline preserved, or refund client. Show justification/review confirmation, second-admin approval when required, and an already-proposed decision linking to Approvals.

**AD05 — Approvals.** Filters for awaiting second admin, approved/processing, executed, and rejected. Show action type, requester, amount, reason, full booking case and supporting evidence. Approve/reject requires reviewing the case; an admin cannot approve their own request. Separate approval from successful execution and provide refresh/recovery for uncertain outcomes.

**AD06 — Bookings & refunds.** Search by booking reference, event or person; paginated results; cancellation-request queue; comprehensive booking review with timeline, parties, attendance, held funds, net payout, disputes, refund status, cancellation split and chat evidence. Full-refund or cancellation-settlement action when eligible, reason, review confirmation, approval-required/pending/result states.

**AD07 — Payment operations.** Unresolved operations with type, status, reference, recovery attempts, next check, latest error and quarantine state. Quarantine/resume actions require investigation evidence. Reconciliation history shows classification, expected/actual balances where available, difference, pending/quarantined counts, aged held/frozen bookings and expandable recorded evidence. Investigation outcomes: investigating, explained, resolved. Present the recorded data clearly; resuming recovery is not authorising a new refund.

**AD08 — Escrow ledger.** Booking filter; date/time, entry type, signed amount, balance after and booking/event link; pagination and empty/error states. Entries are permanent financial records. No edit/delete affordances.

**AD09 — Users.** Phone/email search, role filter, account records and status, pagination, suspend/reactivate review and confirmation, keep-current-status action, progress/error/uncertain result handling.

Use shared review panels across bookings, disputes and approvals. Put the relevant person, event, amount, reason and evidence in view before the consequential action. Preserve disabled and permission/state-restricted actions with understandable explanations.

## 6. Public marketing website

The current website is one responsive page with interactive sections, not separate client and worker portals. Design a complete desktop page, tablet adaptation and mobile version, including mobile navigation.

Include:

1. Brand header and navigation to organiser information, worker information, event occasions and getting started.
2. Bold hero with compelling event-team imagery, concise Lagos staffing proposition, Hire event staff and Find event work actions.
3. Event-type strip: weddings, corporate events, private parties, brand activations.
4. Organiser how-it-works: post the event, choose/invite people, confirm and coordinate the event.
5. Interactive event-occasion selector with relevant detail and photography.
6. Trust section covering identity verification, held payments and the 72-hour rule, attendance and problem resolution.
7. Worker section covering profile creation, availability, applications, transparent earnings and reputation.
8. Expandable FAQs about hiring, payment protection, pricing, cancellation and joining as an usher.
9. Getting-started section with organiser/worker selection and role-specific copy. Include both public-signup-link-available and coming-soon states. Do not invent a working waitlist form, newsletter, app-store links or public signup availability.
10. Footer with the official mark, brand statement, FAQ and back-to-top links.

Do not use fabricated testimonials, customer logos, “trusted by” numbers or marketplace performance statistics. Product sample data belongs in the app designs and should be clearly fictional in the design documentation.

## 7. Reusable design system and state coverage

Create colour variables, type styles, spacing tokens, radius and elevation rules, icon guidance and component variants. Use semantic names that map cleanly into code. Define a small, consistent set of visual treatments for primary, secondary, destructive, disabled, loading and focused states.

Reusable components should cover navigation, app bars, buttons, inputs, six-digit code fields, selects/searchable pickers, option cards, chips, tabs, date/time selection, headcount stepper, avatars, upload/gallery UI, verification and status badges, event/job/staff cards, staffing-progress indicators, booking rows, review stars, chat bubbles/composer, notifications, balance displays, money breakdowns, bank selection, receipts, alerts, empty states, skeletons, toasts, confirmations, admin tables, pagination and evidence-review panels.

For each relevant screen, design loaded, empty, loading, error/retry and action-in-progress states. Add state-specific variants for payments, verification, availability, attendance, approvals and uploads. Include offline/stale data, restricted access, interrupted external checkout, camera/photo permission denial, and safe-area/keyboard-visible layouts where relevant.

Use mobile base frames around 390×844, verify critical layouts at 360px width, and demonstrate flexible layouts for larger phones. Use at least 44×44 touch targets, readable body text, contrast at WCAG AA levels, visible focus for web, screen-reader-aware labels, status cues beyond colour, larger-text behaviour and reduced-motion notes.

Motion should reinforce a result or hierarchy: subtle pressed states, sheet transitions, selection feedback, and restrained success feedback. Do not add decorative movement to money totals, error messages or time-critical attendance actions.

## 8. Prototype flows

Connect these end-to-end journeys with realistic back navigation and recovery:

- New client: Welcome → Role → Phone → OTP → Profile → Home.
- Recruit through applications: Create event → Published → Event detail → Applications → Select staff → Confirm & pay → external Paystack handoff → Payment status → Confirmed bookings.
- Recruit by invitation: Discover → Filters → Staff profile → Invite to event → Sent invitation → usher receives/accepts → client selection/payment → Confirmed booking.
- Payment interruption: Checkout → browser dismissed → original payment status → resume/check → confirmed, expired or refund outcome.
- Event day: Client roster → per-person code → usher check-in or reported arrival → completion → 72-hour hold → released wallet balance.
- Worker onboarding: Role/OTP → Profile setup → Identity verification → provider handoff → Pending → Approved or Rejected/retry.
- Worker job journey: Jobs → Job detail → Save/apply → Applied status → Confirmed booking → Messages and event coordination.
- Earnings: Wallet → Add/resolve bank account → Amount → Review → Confirm → receipt/processing → Withdrawal details/history.
- Cancellation: Booking → quote → confirm → approval/pending status if required → settlement/refund outcome.
- Dispute: Booking → reason/details → frozen funds/case status → admin review → second approval when required → visible resolution.
- Review: Released booking → rate counterpart → submitted review.
- Privacy: Settings → consent changes/export/erasure confirmation and blocked-erasure recovery.
- Marketing: audience selection → role-specific getting-started state.

## 9. Scope boundaries

Treat this inventory as the current capability baseline. Do not silently add future product features to the main designs. Keep any suggested additions on a separate, clearly labelled “Future ideas — not implemented” page.

Examples outside the current core: saved/favourite staff lists, unrestricted pre-booking chat, group broadcasts, voice-note creation/playback, QR attendance scanning, a dedicated dispute-photo upload, map/distance job search, AI matching, emergency replacement marketplace, agency/corporate portals, standalone admin event-management or analytics screens, whole-event cancellation/duplication controls, public waitlist forms and a theme-switching feature.

Saved **jobs**, text/photo booking chat, six-digit attendance codes, per-booking cancellation and the other explicit capabilities above are in scope. Do not remove them because a similar feature appears in the future-ideas list.

## 10. Figma deliverables and implementation handoff

Organise the file into clear pages: Foundations & Components; Account & Verification; Client; Usher; Shared Booking & Money Flows; Admin; Marketing; Prototypes; Coverage & Handoff. Retain screen IDs from this brief in frame names, such as “E11 / Payment status / Needs checking”.

Use editable native Figma elements, Auto Layout, sensible constraints, reusable components, component properties, variants and variables. Keep typography and spacing consistent. Avoid flattened full-screen images and unexplained absolute positioning. External provider/OS screens should be annotated handoff frames.

Document:

- Which frame covers every screen ID and each important state.
- Which components are shared, including the role-specific differences.
- Primary/secondary actions, back destinations and disabled-state reasons.
- Mobile/web responsive behaviour, scroll areas, fixed navigation and keyboard handling.
- Design tokens, exportable assets, image usage and empty-image fallbacks.
- Any deliberate UX change from the current behaviour, so implementation changes can be evaluated explicitly.
- Any missing design or tool limitation. Never mark an uncreated screen complete.

Build the foundations and representative screens first, then reuse that system across the entire inventory. If the tool needs multiple passes, work through the pages in batches and maintain the coverage checklist until everything is designed. Do not stop after a few attractive hero screens. The final file must support implementing the whole frontend consistently.

Finish with a short design rationale and a screen/state coverage checklist linking to the created frames. The goal is a cohesive, beautiful, usable product that an engineer can faithfully build from the Figma file.

---

## Appendix — current route mapping for implementation

This appendix is implementation metadata. Do not display these paths as product UI.

Mobile paths below are relative to `apps/mobile/app/`.

| Screen ID | Current route source |
|---|---|
| A01 | `(auth)/welcome.tsx` |
| A02 | `(auth)/role.tsx` |
| A03 | `(auth)/phone.tsx` |
| A04 | `(auth)/otp.tsx` |
| A05 | `(auth)/complete-profile.tsx` |
| B01 | `(verification)/profile-setup.tsx` |
| B02 | `(verification)/id-verification.tsx` |
| B03 | `(verification)/awaiting-approval.tsx` |
| B04 | `(verification)/verification-rejected.tsx` |
| C01 | `(client)/home.tsx` |
| C02 | `(client)/discover.tsx` |
| C03 | `(client)/events/index.tsx` |
| C04 | `(client)/events/[id].tsx` |
| C05 | `(client)/messages.tsx` |
| C06 | `(client)/profile.tsx` |
| D01 | `(usher)/home.tsx` |
| D02 | `(usher)/jobs.tsx` |
| D03 | `(usher)/calendar.tsx` |
| D04 | `(usher)/messages.tsx` |
| D05 | `(usher)/wallet.tsx` |
| D06 | `(usher)/profile.tsx` |
| E01 | `(modals)/staff-profile.tsx` |
| E02 | `(modals)/filters.tsx` |
| E03 | `(modals)/invite-staff.tsx` |
| E04 | `(modals)/invitations.tsx` |
| E05 | `(modals)/invitation.tsx` |
| E06 | `(modals)/create-event.tsx` |
| E07 | `(modals)/event-success.tsx` |
| E08 | `(modals)/edit-event.tsx` |
| E09 | `(modals)/applications.tsx` |
| E10 | `(modals)/payment-summary.tsx` |
| E11 | `(modals)/funds-held.tsx` |
| E12 | `(modals)/payment-failed.tsx` |
| E13 | `(modals)/event-details.tsx` |
| F01 | `(modals)/my-bookings.tsx` |
| F02 | `(modals)/booking-details.tsx` |
| F03 | `(modals)/event-day.tsx` |
| F04 | `(modals)/check-in.tsx` |
| F05 | `(modals)/message-thread.tsx` |
| F06 | `(modals)/cancellation.tsx` |
| F07 | `(modals)/dispute.tsx` |
| F08 | `(modals)/rate-staff.tsx` |
| G01 | `(modals)/notifications.tsx` |
| G02 | `(modals)/account-settings.tsx` |
| G03 | `(modals)/edit-profile.tsx` |
| G04 | `(modals)/privacy-data.tsx` |
| G05 | `(modals)/withdraw.tsx` |
| G06 | `(modals)/withdrawal-history.tsx` |
| G07 | `(modals)/withdrawal-details.tsx` |
| G08 | `privacy-policy.tsx` |
| H01 | `+not-found.tsx` |

The legacy `(verification)/kyc-consent.tsx` redirects to B02. `index.tsx` and `_layout.tsx` files handle entry/navigation rather than standalone screen designs.

Admin screen sources are under `apps/admin/src/pages/`.

| Screen ID | Current source | Authenticated URL |
|---|---|---|
| AD01 | `Login.tsx` | Authentication gate |
| AD02 | `Dashboard.tsx` | `/` |
| AD03 | `Verifications.tsx` | `/verifications` |
| AD04 | `Disputes.tsx` | `/disputes` |
| AD05 | `Approvals.tsx` | `/approvals` |
| AD06 | `Bookings.tsx` | `/bookings` |
| AD07 | `PaymentOperations.tsx` | `/payment-operations` |
| AD08 | `Ledger.tsx` | `/ledger` |
| AD09 | `Users.tsx` | `/users` |

Marketing is implemented in `apps/website/src/App.tsx`. The supplied logo asset is `apps/website/public/hirequick-mark.svg`.

Inventory basis: local route sources, shared conversation/profile components, checkout states, admin case-review components, `.impeccable.md`, and the approved settlement-policy amendment dated 21 September 2026. Source behaviour takes precedence over outdated aspirational feature lists and stale code comments. Visual treatments, specimen frame sizes, prototype organisation and the sample event are design instructions, not claims about the current UI.
