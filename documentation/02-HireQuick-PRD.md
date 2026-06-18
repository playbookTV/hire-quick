# HireQuick — Product Requirements Document (PRD)

**Version:** 2.1
**v2.1 changes:** usher-payout protection (self-check-in + auto-complete when the client is passive); payout-to-wallet vs withdraw-to-bank clarified; commission sweep; maker-checker on refunds/disputes; cancellation processing-fee copy gated on the Paystack answer; fraud and leakage mitigations strengthened to match their risk ratings. Flagged inline as **[v2.1]**.
**Prepared for:** HireQuick
**Prepared by:** Leslie Williams
**Launch market:** Lagos, Nigeria
**Status:** Pre-build

---

## 1. Introduction

### Purpose

This document defines the functional, operational, and business requirements for HireQuick, a mobile-first marketplace connecting event organizers with verified ushers and event staff in Lagos. It is the blueprint for design, engineering, and stakeholder alignment.

### What changed from v1

This revision resolves four structural problems in the earlier draft: (1) the payment model is now an explicit escrow/wallet flow rather than the contradictory "split payments"; (2) events can require **multiple** staff, with per-usher bookings and payments modelled accordingly; (3) cancellation, refund, and dispute logic is specified rather than merely listed as a risk; (4) success metrics, provider choices, and scale targets are made internally consistent. Substantive changes are flagged inline as **[v2]**.

---

## 2. Product Vision

Enable event organizers to discover, hire, coordinate, verify, and pay trusted event staff — with payment held safely until the staff actually show up.

---

## 3. Product Goals

**Business goals:** generate recurring commission revenue; become the default staffing platform for Lagos event organizers; shift staffing off informal channels; grow repeat bookings into the primary volume driver.

**Client goals:** hire vetted staff quickly; manage all staffing in one place; reduce no-shows; pay securely with recourse.

**Usher goals:** access more work beyond a personal network; control availability; receive reliable, guaranteed payment; build a portable reputation.

---

## 4. Product Scope

### Included (v1)

Client experience, usher experience, admin dashboard, identity verification, multi-staff event creation, applications and invitations, escrow payments, in-app messaging, attendance verification, reviews, push + email notifications, and the cancellation/refund/dispute flow.

### Explicitly excluded (v1)

Agency accounts, corporate billing accounts, dynamic pricing, SMS notifications, automated emergency-replacement matching, promoted listings, staff scheduling/rostering, payroll, and tax handling. These map to V1.5/V2 (see §17).

---

## 5. User Personas

### Persona A — Sarah Johnson, Wedding Planner (31)

Hires several ushers per event, often multiple events a month. **Goals:** staff a wedding with 6–10 ushers quickly; keep a consistent professional standard; coordinate without chasing people across WhatsApp. **Pain points:** late cancellations, unverified referrals, no recourse when someone doesn't show. **What success looks like:** posts an event Monday, has 8 vetted ushers confirmed by Tuesday, pays once, and knows the money is safe until the day.

### Persona B — Ada Martins, Freelance Usher (24)

Works events to earn consistent income. **Goals:** steady bookings, visibility beyond her referral network, prompt payment. **Pain points:** feast-or-famine work, payment withheld or delayed after the job, reputation that doesn't travel. **What success looks like:** a profile that earns her invitations, a calendar she controls, and a guaranteed payout the day after each verified event.

### Persona C — Tunde, Operations/Admin (internal)

Keeps the marketplace trustworthy. **Goals:** verify identities fast, resolve disputes fairly with an evidence trail, monitor escrow health. **Pain points:** fraud attempts, ambiguous disputes, manual reconciliation. (Added in **[v2]** because the admin role drives several requirements and had no persona.)

---

## 6. Product Epics

1. Authentication & Account Management
2. Profile Creation & Identity Verification
3. Event Creation (multi-staff)
4. Event Discovery
5. Applications & Invitations
6. Bookings (per-usher, multi-fill)
7. Escrow Payments & Payouts
8. Messaging
9. Attendance Verification
10. Reviews & Ratings
11. Cancellations, Refunds & Disputes **[v2]**
12. Administration

---

## 7. Core Domain Model (plain-language) **[v2]**

The single most important correction: an **event** is not a booking. One event can require many staff, and each filled slot is its own booking with its own payment.

- An **Event** has a required headcount (e.g. "6 ushers").
- Each accepted application or invitation creates one **Booking** (one event ↔ one usher).
- Each booking has its own **Payment** record and its own **attendance** state.
- The client pays **once** at confirmation for all slots being confirmed in that batch; the ledger splits that charge into per-booking escrow allocations.
- An event is **fully staffed** when confirmed bookings equal required headcount, **partially staffed** below it.

This lets a client hire 6 ushers, have 5 show up, and pay out exactly those 5 while the 6th is refunded or penalized — none of which the v1 model could express.

---

## 8. User Stories & Acceptance Criteria

### Authentication

**Sign up with phone**
*As a user, I want to sign up with my phone number so I can access HireQuick securely.*
Accepts when: user enters a valid Nigerian phone number; OTP is sent; OTP is verified within its validity window; account is created with a role selected; failed/expired OTP offers resend with rate limiting.

**Reset access**
*As a user, I want to recover access if I'm locked out.*
Accepts when: user requests recovery; OTP verification is sent; on success the user sets a new password; sessions on other devices are invalidated.

### Profile & Verification

**Usher identity verification [v2]**
*As an usher, I want to verify my identity so clients trust me and I can receive payouts.*
Accepts when: usher submits required ID and a selfie; profile enters *Pending Verification*; admin approves or rejects with reason; only *Verified* ushers appear in discovery, can apply, or can be paid out.

### Event Creation

**Create a multi-staff event [v2]**
*As a client, I want to create an event needing a set number of staff so the right people can apply.*
Accepts when: client enters title, venue, date, time, role/category, **headcount**, dress code, **budget per head**, and instructions; the event publishes; matching ushers are notified; the event shows live "X of N confirmed".

### Discovery & Hiring

**Browse staff**
*As a client, I want to browse ushers so I can invite people directly.*
Accepts when: verified, available profiles display; filters (availability, location, rating, price) apply; client can invite, save, or view a profile.

**Apply to an event**
*As an usher, I want to apply to events so clients can consider me.*
Accepts when: usher opens an open event; applies; application status is visible (Applied / Shortlisted / Accepted / Rejected / Withdrawn); usher cannot apply if unavailable on that date.

**Invite a specific usher**
*As a client, I want to invite someone I trust.*
Accepts when: client invites a verified usher; usher is notified; usher accepts or declines; acceptance reserves a slot pending payment.

### Bookings & Payment

**Confirm and pay into escrow [v2]**
*As a client, I want to confirm my chosen staff and pay once, safely.*
Accepts when: client selects accepted applicants up to headcount; sees a summary (per-head budget × count, fees shown, total); pays via Paystack; funds enter escrow; each selected usher gets a confirmed booking; messaging unlocks per booking.

**Receive guaranteed payout [v2]**
*As an usher, I want to be paid reliably after I work.*
Accepts when: my attendance is verified on the day; the booking reaches *Completed*; my share (booking value minus platform fee) is transferred to my wallet; I can withdraw to a Nigerian bank account.

### Messaging

**Coordinate with confirmed staff**
*As a client, I want to chat with confirmed staff only.*
Accepts when: chat unlocks per booking after confirmation; supports text, images, voice notes; flags shared phone numbers/emails/links with a safety notice; chat is scoped to that booking.

### Attendance

**Verify attendance**
*As a client, I want to confirm staff arrived so payment releases.*
Accepts when: client generates an OTP (or shows a QR); usher enters/scans it on site; booking moves to *Checked In*; on event completion it moves to *Completed* and arms payout; unverified staff by a cutoff are flagged no-show.

**Get paid even if the client is passive [v2.1]**
*As an usher, I want my payout protected when I show up but the client never verifies me.*
Accepts when: the usher can mark *I've arrived* independently of the client; if the booking has an asserted arrival (or a verified check-in) and the client never confirms completion, the booking **auto-completes at event end + grace window (default 60 min)** and the payout is released; the client's only recourse against a false arrival claim is to open a dispute (not to silently withhold). This closes the gap where a passive or withholding client could deny a working usher their guaranteed payout. (See TRD §12.)

### Reviews

**Leave feedback**
*As a client/usher, I want to rate the other party so reputation is earned.*
Accepts when: after *Completed*, both sides may rate 1–5 with optional comment; reviews publish to profiles; ratings feed discovery ranking. **[v2]** reviews are now two-way.

### Cancellations & Disputes **[v2]**

**Cancel a booking**
*As a client or usher, I want to cancel when I must, understanding the consequences.*
Accepts when: the canceller sees the applicable policy outcome (refund %, penalty) before confirming; the ledger executes the correct refund/forfeit; reputation effects apply per §13.

**Raise a dispute**
*As either party, I want to dispute an outcome so it's resolved fairly.*
Accepts when: a party opens a dispute on a booking within the dispute window; escrow for that booking is frozen; both sides submit evidence; admin resolves with a recorded outcome and ledger action.

---

## 9. Functional Requirements

**Authentication:** phone + OTP login, password set/reset, session management, logout, rate limiting.

**Client:** create/edit/cancel event (with headcount), browse & search staff, invite staff, review & select applicants up to headcount, pay into escrow, verify attendance, rate staff, message confirmed staff, raise disputes.

**Usher:** create profile, complete identity verification, manage availability calendar, browse & apply to events, accept/decline invitations, view booking & payout status, withdraw earnings, message clients, rate clients, raise disputes.

**Admin:** approve/reject verifications, suspend/reinstate accounts, view & act on escrow ledger, process refunds, resolve disputes, view reports & analytics, manage categories.

---

## 10. Notifications

**Events:** new application, applicant shortlisted, invitation received, invitation accepted/declined, booking confirmed, payment captured to escrow, attendance pending (day-of reminder), attendance verified, payout released, withdrawal successful, review reminder, verification approved/rejected, cancellation notice, dispute opened/resolved.

**Delivery (v1):** push (Firebase Cloud Messaging) and email (Resend). **SMS is explicitly out of v1** despite the OTP need — OTP delivery uses a dedicated OTP/transactional provider, not the notification system. **[v2]** removes the earlier ambiguity between "no SMS" and an SMS-based OTP.

---

## 11. Reviews & Ratings

Two-way, 1–5 stars with optional written feedback, shown as average + count on each profile, available only after a booking reaches *Completed*, and weighted into discovery ranking. No-shows and late cancellations attach a non-removable reliability signal to the profile. **[v2]**

---

## 12. Payments & Escrow Requirements **[v2]**

**Provider:** Paystack (Nigeria). **Model:** wallet/escrow, not split settlement.

**Mechanism [v2.1]:** Paystack has no turnkey conditional-escrow product. The hold-then-release flow is built from **Manual Payouts** (client payments stay in HireQuick's Paystack Balance instead of auto-settling to the bank) plus the **Transfers API** (releases each usher's payout from that balance on verified attendance). HireQuick is the party holding the funds; both features require a **Registered Business** Paystack account and Manual Payouts must be enabled by Paystack on request. See TRD §10 and §23.

**Flow**

```
Client confirms selected staff
        │
        ▼
Paystack charge (full amount) ──► HireQuick Paystack balance
        │
        ▼
Internal ledger: create one escrow allocation per booking
        │
   (funds HELD — not revenue, not paid out)
        │
        ▼
Attendance verified per booking  (or auto-completed at event end + grace — see §8, TRD §12)
        │
        ▼
Ledger releases usher share ──► credited to usher wallet (held balance, still in our Balance)
Ledger records platform commission (15%)
        │
        ▼
Usher withdraws wallet ──► Paystack Transfer ──► Nigerian bank account
        │
        ▼
[scheduled] Commission sweep ──► Paystack Transfer ──► HireQuick operating bank   [v2.1]
```

> **Payout lands in the usher's wallet, not their bank, on release [v2.1].** The Paystack Transfer fires when the usher *withdraws*, not per booking — so "released" and "withdrawn" are distinct. Whether holding usher balances is permitted, or payouts must transfer straight to bank, is a blocking question (TRD §23 Q7). **Commission becomes revenue only via the scheduled sweep [v2.1]** — until then the 15% sits in the Balance; the sweep is on the Paystack agenda (TRD §23 Q8).

**Booking status (per usher):**
`Pending Payment → Confirmed → Checked In → Completed → Paid`
with branch states `Cancelled`, `No-Show`, `Disputed`, `Refunded`. **[v2]** — the v1 enum had no cancelled/disputed/refunded states despite the UX showing them.

**Webhooks consumed:** `charge.success`, `transfer.success`, `transfer.failed`, `refund.processed`. Failed transfers retry and alert ops; they do not silently drop.

**Ledger invariant:** at all times, escrow held = sum of confirmed-but-not-completed booking allocations. This is reconciled daily against Paystack balance.

**Compliance gate:** because HireQuick (not Paystack) holds client funds in its Balance pending release, this may constitute regulated activity under CBN payment-services rules. Confirm HireQuick's merchant-of-record position within Paystack's licence, or its own licensing need, **before processing live funds**. Blocking item — see the structured Paystack agenda in TRD §23.

---

## 13. Cancellation, Refund & Dispute Policy **[v2]**

Previously absent; this is now a first-class part of the product because cancellation, no-shows, and disputes are the top operational risks.

### Client cancels a confirmed booking

| When | Client refund | Usher compensation | Usher reputation |
|---|---|---|---|
| > 48h before event | 100% (less non-refundable processing fee †) | none | none |
| 12–48h before | 50% | 50% to usher | none |
| < 12h before | 0% | 100% to usher | none |

### Usher cancels a confirmed booking

| When | Client refund | Usher reputation |
|---|---|---|
| > 48h before | 100% | minor reliability flag |
| 12–48h before | 100% | reliability penalty |
| < 12h before | 100% | major penalty; repeat offenders suspended |

### No-show (usher confirmed, neither verified nor self-asserted by cutoff)

Client is refunded 100% for that booking; usher receives nothing and takes a major reliability penalty. The cutoff is event start + a configurable grace window (default 60 min). A no-show requires **both** no client verification **and** no usher self-asserted arrival (§8) by the cutoff — so an usher who turned up and self-checked-in is never wrongly flagged. **[v2.1]**

### Disputes

Either party may open a dispute on a booking within **72h** of the event. That booking's escrow is frozen, both parties submit evidence (chat history, photos, verification logs are attached automatically), and an admin resolves within an SLA with a recorded outcome that drives the ledger. Attendance-verification logs and in-app chat are the primary evidence, which is a direct reason messaging and verification stay on-platform. **Refunds and dispute payouts above a configurable amount require a second admin to approve (maker-checker); every action is audit-logged (TRD §15). [v2.1]**

> All percentages above are **launch defaults**, configurable by ops, and must be shown to the user before they confirm any cancellation.
> **† [v2.1]** Whether the original Paystack processing fee is actually non-refundable depends on Paystack's answer to TRD §23 Q4. If it turns out to be recoverable on refund, drop "less non-refundable processing fee" and refund 100%. Do not hard-ship this copy until Q4 is settled.

---

## 14. Non-Functional Requirements

| Area | Requirement |
|---|---|
| App cold start | < 2s on a mid-range Android device |
| API response (p95) | < 500ms |
| Uptime | 99.5% (v1 target; 99.9% is a maturity goal, not a launch promise) |
| Accessibility | WCAG 2.1 AA |
| Scale | Architect for 100,000 registered users / 5,000 concurrent at launch capacity; see TRD for headroom |
| Security | JWT + refresh tokens, Argon2id password hashing, encrypted storage, RBAC, rate limiting, audit logs |
| Data residency | Prefer a region with low latency to Nigeria; document where PII and ID documents are stored |

**[v2]** reconciles the earlier 100,000-users vs 50,000-concurrent mismatch (different metrics, now stated as such) and softens the 99.9% uptime claim to a realistic launch figure.

---

## 15. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | Cold-start: too few ushers for liquidity | High | High | Hand-recruit & verify founding pool before client launch; seed first events | Ops |
| 2 | Regulatory exposure on held funds | Med | High | Confirm MoR/licensing with Paystack + counsel pre-launch (blocking) | Founder |
| 3 | Fraudulent usher profiles | Med | High | Mandatory ID verification + admin gate. **[v2.1]** Manual review alone can't catch a stolen-ID + matching-selfie; add a liveness check / 3rd-party KYC in V1.5 and treat the v1 manual gate as a known residual risk | Trust & Safety |
| 4 | Payment disputes / chargebacks | Med | Med | Escrow + verification logs + dispute flow | Ops / Finance |
| 5 | No-shows | Med | Med | Escrow withholds payout; reputation penalties | Product |
| 6 | Cancellation abuse | Med | Med | Tiered policy with windows & fault rules (§13) | Product |
| 7 | Off-platform leakage (client + usher transact privately after first match) | High | Med | Keep escrow + dispute value on-platform; reputation only accrues on-platform. **[v2.1]** A *non-blocking* contact-sharing notice is weak for a High-likelihood risk — strengthen with contact-masking and withholding precise venue/contact until escrow is held; revisit if leakage shows up in the first cohort | Product |
| 8 | PII / ID-document breach | Low | High | Encrypted storage, signed URLs, least-privilege access, retention policy | Eng |

**[v2]** adds off-platform leakage (the existential marketplace risk the v1 docs never named) and PII handling.

---

## 16. Dependencies

Paystack (payments/escrow/transfers), a transactional OTP/SMS provider for phone verification, Firebase Cloud Messaging (push), Resend (email), Backblaze B2 or AWS S3 (media & ID documents, with signed URLs), and cloud hosting (see TRD). **[v2]** names the OTP provider separately from notifications and standardizes email on Resend (the v1 set listed a generic "OTP Provider" and conflicting email choices).

---

## 17. Release Roadmap

**V1 (launch):** auth, profiles + identity verification, multi-staff event posting, browse/apply, invitations, escrow payments & payouts, messaging, attendance verification, two-way reviews, cancellation/refund/dispute flow, admin dashboard.

**V1.5:** saved favourite staff, featured profiles, semi-automated emergency replacement (suggest + one-tap re-invite when a confirmed usher cancels late), basic referral incentives for supply growth.

**V2:** agency accounts, corporate billing accounts, dynamic pricing, AI-assisted matching/ranking, SMS notifications, additional staff categories (photographers, security, MCs, waiters, hospitality), multi-city expansion.

**[v2]** promotes the cancellation/dispute flow and identity verification into V1 (they're load-bearing, not optional) and keeps genuinely deferrable items out.

---

## 18. Out of Scope (v1)

Staff scheduling/rostering, payroll, tax calculation/remittance, external/off-platform messaging, agency management, corporate billing, and dynamic pricing.
