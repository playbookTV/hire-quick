# HireQuick — User Experience Requirements Document (UXRD)

> **Pricing amendment — 26 September 2026:** new checkouts add a 15% client-paid platform fee to agreed staff pay. Ushers receive their full agreed pay. Cancellation percentages apply separately to staff pay and the added fee; the fee is refunded proportionally. Existing orders retain their recorded terms. See [client-paid fee policy](payments/client-paid-fee-policy-2026-09-26.md).


> **Policy amendment — approved 21 September 2026:** completion keeps funds in escrow until event end + 72 hours; undisputed completed bookings then become eligible for wallet release. Client cancellations use 100% / 50% / 0% refunds at >48h / 12–48h inclusive / <12h, with the former fee-deducted pricing (superseded for new checkouts by the 26 September amendment) and no processing-fee deduction from the refund. See the [approved decision and implementation criteria](payments/approved-settlement-policy-2026-09-21.md). Local implementation is tracked in OVA-136/137; see the [implementation and validation record](payments/settlement-implementation-2026-09-21.md). Deployment remains separately recorded.

**Version:** 2.1
**v2.1 changes:** platform fee display superseded by the 26 September amendment; usher self-check-in + client-passive auto-complete in the attendance flow; wallet "available vs withdraw-to-bank" clarified; booking-status label↔DB-enum mapping; cancellation processing-fee copy flagged as pending. Flagged inline as **[v2.1]**.
**Prepared for:** HireQuick
**Prepared by:** Leslie Williams
**Launch market:** Lagos, Nigeria
**Status:** Pre-build

---

## 1. Introduction

This document defines the experience requirements, interaction patterns, navigation, and behavioural expectations for HireQuick. It is the blueprint for designers and engineers delivering a trustworthy staffing experience for organizers and ushers in Lagos.

**v2 changes:** flows now reflect **multi-staff events** (an event fills N slots, not one), the **escrow payment** language (money is *held* then *released*), **two-way reviews**, and entirely new **cancellation and dispute** experiences. Substantive changes flagged **[v2]**.

---

## 2. Experience Principles

**Trust first.** Every interaction reinforces that people are verified and money is safe. Verification badges, escrow status, and attendance state are always visible, never buried.

**Hire fast — honestly.** Clients should reach a confirmed roster quickly, but the UI never implies "instant" when supply is thin. It shows real progress ("4 of 6 confirmed") rather than false immediacy.

**Reduce coordination.** The product replaces WhatsApp groups, calls, and spreadsheets. If a task currently happens in a side channel, it should happen here.

**Transparency.** At any point a user can see what happened, what happens next, who needs to act, and where their money is.

**Mobile first, one-handed.** Primary actions are reachable with a thumb; nothing critical hides behind long scrolls or precise taps.

---

## 3. User Roles

**Client:** event planners, wedding coordinators, corporate organizers, private hosts.
**Usher:** freelance ushers, registration assistants, greeters, promotional staff.
**Administrator:** operations, support, finance, trust & safety.

---

## 4. Information Architecture

**Client:** Home · Discover · Events · Messages · Profile
**Usher:** Home · Jobs · Calendar · Wallet · Profile
**Admin (web):** Dashboard · Users · Verifications · Events · Escrow & Payments · Disputes · Analytics

**[v2]** adds an explicit **Verifications** and **Escrow & Payments** area to admin, since identity review and ledger oversight are now core.

---

## 5. Navigation Structure

**Client bottom nav:** Home · Discover · Events · Messages · Profile
**Usher bottom nav:** Home · Jobs · Calendar · Wallet · Profile

Five destinations each, fixed, with the most frequent action (Discover for clients, Jobs for ushers) one tap from anywhere.

---

## 6. Client Experience

### 6.1 Onboarding

Launch → Welcome → Enter phone → OTP → Choose role (Client) → Complete profile → Home.
Target: under 2 minutes. Role choice is explicit and changeable only via support, to keep the two experiences clean.

### 6.2 Home

**Sections:** events in progress ("4 of 6 confirmed" style status), recent conversations, suggested ushers, pending reviews.
**Quick actions:** Create Event · Browse Staff.

### 6.3 Create Event Flow **[v2 — multi-staff]**

Home → Create Event →
**Basic info:** title, venue, date, time, category.
**Staffing requirements:** **number of staff needed (headcount)**, role, dress code, **budget per head**, special instructions, and any preference fields (see §6.4 note).
**Review:** shows total estimated cost (budget per head × headcount, plus the platform fee) → Publish → Success.

The event now carries a headcount and a per-head budget, and every downstream screen reasons in "X of N".

> **Preference fields note [v2]:** gender, height, and dress-size filters exist because some promotional/usher briefs specify them. They are presented as **optional** requirements with a short rationale ("Some brands request specific presentation for promo work"), are logged for audit, and are governed by a non-discrimination policy. Ops can disable them per-category. This is a deliberate, documented choice rather than a silent default.

### 6.4 Browse Staff (Discover)

Discover → Search → Filters (availability, location, price range, rating; optional presentation filters per the note above) → Results.
**Staff card:** photo, name, verification badge, rating, completed jobs, availability, price.
**Actions:** Invite · Save · View Profile.

### 6.5 View Profile

Photo gallery, verification badge, bio, languages, experience, two-way reviews, completed jobs, availability, reliability indicator (**[v2]** — surfaces no-show/late-cancel history honestly).
**Buttons:** Invite · Message (locked until a confirmed booking exists) · Save.

### 6.6 Event Management **[v2]**

**Status:** Draft · Open · Partially Staffed · Fully Staffed · In Progress · Completed · Cancelled.
The fill state ("4 of 6") is the headline. **Actions:** Edit, Close Applications, Add/Remove Slots, Cancel Event, Duplicate.
Cancelling an event walks the client through the cancellation policy outcome for each confirmed booking before anything executes.

### 6.7 Applications & Selection **[v2]**

Applications received → Review applicant → Shortlist / Accept / Reject.
The client accepts **up to the headcount**; a live counter shows remaining slots. Accepting staff moves them to a pending-payment basket; one payment confirms the batch.

### 6.8 Messaging

Chat unlocks **per confirmed booking** (after payment), not merely on acceptance — money in escrow is the gate. Supports text, images, voice notes. Sharing phone numbers, emails, or external links triggers a non-blocking safety notice: *"For your safety and dispute protection, keep coordination and payment on HireQuick."* Chat history is retained as dispute evidence.

### 6.9 Payments **[v2 — escrow language]**

Booking summary (per-head × count, client-paid platform fee added on top, total) → Proceed to Payment → Paystack checkout → **Funds Held in Escrow** confirmation (not "paid to staff") → bookings confirmed.

> **Fee display [26 September 2026]:** the client pays `budget per head × count` plus the sum of each booking’s 15% platform fee. Show staff subtotal, added fee and total. Usher job screens show the full agreed pay; no platform fee is deducted. Saved legacy orders show their original price.
The success screen explicitly states money is held safely and released only after attendance is verified. This is a trust moment and is designed as one.

### 6.10 Event Day

Reminder ("Your event starts in 2 hours") → Navigate to venue → **Attendance verification per usher**: client generates an OTP (or shows a QR); each usher enters/scans on arrival; the roster shows who's checked in live ("5 of 6 checked in"). At event completion the client confirms, bookings move to *Completed*, and payouts arm. Any usher unverified **and** not self-arrived by the start cutoff is flagged no-show and handled per policy.

> **If the client is passive [v2.1]:** the usher can tap *I've arrived* on their side, and a booking that has an arrival (or a check-in) **auto-completes at event end + a grace window** even if the client never confirms — so a forgetful or withholding client can't deny a working usher their payout. The client's recourse is to open a dispute, not to silently withhold. (PRD §8, TRD §12.)

### 6.11 Review Experience **[v2 — two-way]**

After completion, the client rates each usher (1–5 + optional comment), and ushers separately rate the client. Reviews publish to profiles and feed ranking.

### 6.12 Cancellation Experience **[v2 — new]**

When a client cancels a confirmed booking, a sheet shows the exact outcome — refund amount, any usher compensation, and timing — based on how close to the event it is (PRD §13), and requires explicit confirmation. No cancellation executes without the user seeing its financial consequence first. **Approved 21 September 2026:** show no processing-fee deduction from the client refund. Show total retained, platform fee retained and usher compensation separately; use the approved exact 12/48-hour boundaries (PRD §13).

### 6.13 Dispute Experience **[v2 — new]**

From a completed or in-progress booking, "Report a problem" opens a dispute: pick a reason, add a note, attach photos. The system auto-attaches chat and verification logs. The screen states that escrow for that booking is frozen pending review and gives an expected resolution time. The user can track dispute status to resolution.

---

## 7. Usher Experience

### 7.1 Onboarding **[v2]**

Welcome → Choose role (Usher) → OTP → Profile setup (full name, bio, photos, experience, languages, availability; optional presentation fields with the same rationale/▸audit treatment as §6.3) → **Identity verification (ID + selfie)** → Awaiting approval → Approved → Dashboard.
Verification is mandatory before a profile is discoverable or can apply. The "awaiting approval" state sets expectations clearly.

### 7.2 Dashboard

Upcoming jobs, pending applications, wallet balance, notifications.
**Quick actions:** Browse Events · Update Availability.

### 7.3 Browse Jobs

Jobs near me, recommended, upcoming. **Filters:** date, distance, budget. Each listing shows per-head budget, role, dress code, and client rating.

### 7.4 Event Details

Venue, date/time, **per-head budget**, dress code, requirements, client rating, slots remaining. **Actions:** Apply · Save. Apply is blocked if the usher is marked unavailable that day.

### 7.5 Invitation Flow

Notification → Open invitation → Review details → Accept / Decline. Accepting reserves a slot pending the client's payment; the usher is told the booking confirms once the client pays into escrow. **[v2]**

### 7.6 Wallet **[v2]**

Current balance, **pending (in-escrow) earnings** shown distinctly from **available** balance, completed earnings, withdrawal history. **Action:** Withdraw to bank. The distinction between held and withdrawable money is explicit so ushers understand escrow. **[v2.1]** *Available* = payouts released after booking completion and event end + 72 hours with no unresolved dispute; completed earnings remain *pending* before release; the actual bank transfer fires only on *Withdraw*. A first withdrawal requires saving a bank account; if a transfer fails (e.g. wrong details) the money stays in the wallet and the usher is prompted to fix it — never lost (TRD §10).

### 7.7 Calendar

Available · Unavailable · Busy (auto-set by confirmed bookings). Tap a date to change status. Confirmed bookings block that date automatically.

### 7.8 Reliability & Reviews **[v2]**

The usher sees their own rating, completed jobs, and reliability signal (no-shows, late cancellations), with plain guidance on how cancellations affect standing — so the policy is understood before it bites.

---

## 8. Empty States

**No events:** "You haven't created any events yet." → Create Event.
**No applications yet:** "No applications yet — you can also invite staff directly." → Browse Staff.
**No earnings:** "Complete your first booking to start earning."
**No messages:** "Messages unlock once a booking is confirmed."
**No jobs (usher):** "No jobs match your filters yet — widen your distance or dates."

**[v2]** corrects the messaging empty state to reflect that chat unlocks on confirmation, not application.

---

## 9. Error & Edge States

**OTP expired:** "Your code has expired." → Resend.
**Payment failed:** "We couldn't process your payment. Your staff aren't confirmed yet." → Try Again.
**Partial fill at deadline [v2]:** "Only 4 of 6 slots are filled. Confirm these 4, extend applications, or invite more staff." → choose.
**Usher cancelled late [v2]:** "An usher cancelled. We can suggest a replacement." → View suggestions (V1.5) / Re-open slot.
**Booking cancelled:** "This booking was cancelled. Your refund of ₦X is being processed." → View details.
**Verification rejected [v2]:** "We couldn't verify your ID." → reason + Resubmit.

### Booking status (usher-facing, **[v2]**)

`Booked → Checked In → In Progress → Completed → Paid`, with `Cancelled`, `No-Show`, `Disputed`, `Refunded` as visible branch states. The earlier flow had no terminal states for the things that actually go wrong.

**Label ↔ DB-enum mapping [v2.1]** (these are display labels; the `bookings.status` enum in TRD §6 is the source of truth — keep them in sync):

| UX label | `bookings.status` |
|---|---|
| Booked | `CONFIRMED` |
| Checked In | `CHECKED_IN` |
| In Progress | *(display-only — derived from event being underway; no separate booking enum value)* |
| Completed | `COMPLETED` |
| Paid | `PAID` (payout released to wallet) |
| Cancelled / No-Show / Disputed / Refunded | `CANCELLED` / `NO_SHOW` / `DISPUTED` / `REFUNDED` |

"Paid" is the released-to-wallet state; **withdrawing to bank is a separate wallet action**, not a booking status (see §7.6).

---

## 10. Notification Catalogue

New application · applicant shortlisted · invitation received · invitation accepted/declined · booking confirmed · funds held in escrow · attendance pending (day-of) · attendance verified · payout released · withdrawal successful · review reminder · verification approved/rejected · cancellation notice · dispute opened · dispute resolved.

---

## 11. Attendance Verification (UX)

**Primary — OTP.** Client taps *Generate Code*; app shows a 6-digit code (e.g. 482913); usher enters it on site; success moves that booking to *Checked In*. Per-usher, so a multi-staff event tracks each arrival.
**Secondary — QR.** Client displays a QR; usher scans it; same result.
**Usher self-check-in [v2.1].** The usher also has an *I've arrived* action on their own booking, used when the client is slow or unavailable. It records arrival and, combined with the end-of-event auto-complete, guarantees the usher isn't left unpaid by a passive client (see §6.10, PRD §8).
Roster view shows live check-in progress ("5 of 6 checked in"). At completion (client-confirmed **or** auto-completed at event end + grace), status advances to *Completed* with funds held. At event end + 72 hours, an undisputed completed booking becomes eligible for wallet release and then *Paid*. Completion copy must not promise available funds; show the release deadline and any dispute hold.

---

## 12. Accessibility Requirements

Minimum touch target 44×44px; text contrast WCAG 2.1 AA; Dynamic Type supported; screen-reader labels on all interactive elements and on status indicators (verification, escrow, attendance); reduced-motion supported; critical status never conveyed by colour alone (escrow/verification states carry text or icon, not just hue).

---

## 13. UX Copy Guidelines

Human language over jargon. Prefer "Publish Event" over "Submit Staffing Request"; "Invite" over "Assign Resource"; "Applications" over "Candidate Pipeline"; **"Funds held safely" over "Escrow initiated"**; **"Money is released after staff check in" over "Payout triggered on verification."** Money and trust language is plain, reassuring, and specific about timing. **[v2]**

---

## 14. Future UX Opportunities

Emergency replacement flow (V1.5), saved favourite staff, AI-suggested matches, agency dashboard, corporate booking portal, multi-city discovery.

---

## 15. Success Metrics (UX)

| Metric | Target | Note |
|---|---|---|
| Median event creation time | < 3 min | Including headcount/budget entry |
| Median applications per open event | ≥ 5 | Supply-dependent |
| Payment completion rate | ≥ 90% | Checkout started → escrow held |
| Repeat client rate (90-day) | ≥ 35% | |
| No-show rate | < 5% | |
| Dispute rate | < 3% | |

Targets align with the PRD and Executive Summary and are re-baselined after the first 100 completed bookings. **[v2]** brings UX metrics into line with the conservative, consistent launch targets used across the document set.
