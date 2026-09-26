# HireQuick — Executive Summary

> **Policy amendment — approved 21 September 2026:** completion keeps funds in escrow until event end + 72 hours; undisputed completed bookings then become eligible for wallet release. Client cancellations use 100% / 50% / 0% refunds at >48h / 12–48h inclusive / <12h, with 15% commission within the remaining usher allocation and no processing-fee deduction from the refund. See the [approved decision and implementation criteria](payments/approved-settlement-policy-2026-09-21.md). Local implementation is tracked in OVA-136/137; see the [implementation and validation record](payments/settlement-implementation-2026-09-21.md). Deployment remains separately recorded.

**Version:** 2.1
**v2.1 changes:** payout lands in an usher wallet (withdraw-to-bank is separate); commission becomes revenue via a scheduled sweep; client-passive auto-complete protects the usher's guaranteed payout; fee shown to the client is informational only. Flagged inline as **[v2.1]**.
**Prepared for:** HireQuick
**Prepared by:** Leslie Williams
**Launch market:** Lagos, Nigeria
**Status:** Pre-build / founding-cohort planning

---

## 1. Executive Overview

HireQuick is a mobile-first staffing marketplace that lets event organizers in Lagos discover, hire, coordinate, verify, and pay professional ushers and event staff in a single trusted flow.

It replaces the informal channels the market runs on today — WhatsApp broadcast groups, Instagram pages, spreadsheets, and personal referrals — with a structured booking experience that holds payment in escrow until attendance is verified, work is completed and the 72-hour window after event end has elapsed without an unresolved dispute. That escrow-on-attendance mechanism is the core of the product: clients only release funds once staff have actually shown up, and staff get a reliable payout for work completed.

HireQuick supports two complementary hiring models. In **event-based hiring**, a client posts an event with its staffing requirements and receives applications from matching ushers. In **direct discovery**, a client browses profiles and invites specific people. Both run on the same booking, payment, and verification rails.

The defining bet is that **trust and guaranteed payment**, not just discovery, are what the market is missing. Anyone can list staff; few can guarantee the usher gets paid and the client doesn't lose money to a no-show.

---

## 2. Problem Statement

Event staffing in Lagos is almost entirely informal, and the informality costs both sides.

**For organizers:**

- No reliable way to find available, vetted staff at short notice
- Last-minute cancellations and no-shows with no recourse
- No visibility into a person's track record or prior work
- Coordination spread across calls, DMs, and spreadsheets
- Cash-based or ad-hoc payment with weak accountability

**For ushers and event staff:**

- Access to work depends on who you know
- Payment is often delayed, partial, or withheld after the job
- No portable reputation or booking history
- Limited exposure beyond a personal network or one agency

The shared root cause is the absence of a neutral party that both verifies the people and guarantees the money. HireQuick is that party.

---

## 3. Proposed Solution

A marketplace built around two hiring models on a common spine of escrow payments and attendance verification.

**Event-based hiring.** The client creates an event specifying venue, date, time, number of staff, role, dress code, budget per head, and any preferences. Matching ushers are notified and apply. The client reviews applicants, selects the number needed, and pays into escrow to confirm.

**Direct discovery.** The client browses usher profiles filtered by availability, location, rating, and price, then invites specific individuals. On acceptance, the client pays into escrow to confirm. This path suits repeat hires, urgent requests, and small events.

**Common spine.** Both paths converge on the same three guarantees: funds held in escrow on confirmation, messaging unlocked only between confirmed parties, and payout released only after attendance is verified on the day.

---

## 4. Target Audience

**Clients:** event planners, wedding coordinators, conference and corporate organizers, small businesses, and individuals hosting private events.

**Event staff:** ushers, registration assistants, greeters, promotional personnel, and brand ambassadors.

**Platform team (internal):** operations, finance, support, and trust & safety / compliance.

The initial wedge is **event planners and wedding coordinators in Lagos** — they hire ushers repeatedly, feel the no-show pain most acutely, and bring volume that seeds liquidity faster than one-off private hosts.

---

## 5. Value Proposition

**For clients:** vetted staff bookable in minutes; money held safely until attendance is confirmed; one place for hiring, chat, and payment; recourse when someone cancels or fails to show.

**For event staff:** more visibility and access to work beyond a personal network; guaranteed payout on verified attendance; a portable rating and booking history that compounds into reputation; control over availability.

**For HireQuick:** recurring commission on every completed booking; two-sided network effects as supply and demand grow together; durable relationships with high-frequency organizers; a base from which to expand into adjacent staffing categories.

---

## 6. Revenue Model

**Primary — commission per completed booking.** HireQuick takes a **15% platform fee** on the booking value, deducted at payout. The fee is charged once per booking and is shown to both sides before confirmation for transparency — but since the usher bears it, it is never added to the client's total (the client pays exactly budget × count). **[v2.1]**

> **Pricing note:** v1 launches at a single flat 15% rather than a 10–15% range. A range invites negotiation and complicates the escrow ledger; one rate is simpler to communicate, build, and reconcile. Volume-based or category-based tiers are a deliberate later decision, not a launch feature.

**Who bears the fee.** v1 charges the fee to the **usher** (deducted from payout), so the client pays exactly the advertised budget per head. This is the lower-friction default for a supply-constrained launch where client price sensitivity is the bigger risk. A client-side or split fee is revisitable once liquidity exists.

**Secondary opportunities (post-v1):** featured staff listings, premium verification badges, priority placement, and corporate staffing packages. None are required for launch economics; all are deferred to V1.5+.

---

## 7. Payments and Attendance Verification

Payments run on **Paystack** using a **wallet/escrow model**, not instant split settlement.

1. On confirmation, the client is charged the full booking amount into HireQuick's Paystack balance, recorded against the booking in an internal ledger.
2. Funds are **held in escrow** — neither released to the usher nor reconciled as revenue — until attendance is verified, work is completed and the 72-hour window after event end has elapsed without an unresolved dispute.
3. After verified or automatic completion and event end + 72 hours, if no unresolved dispute exists, the ledger releases each usher's share **into their wallet** and records HireQuick's commission. The usher later **withdraws** the wallet balance to their bank; that withdrawal is when the Paystack Transfer actually fires.
4. HireQuick's accumulated 15% commission is moved out of the Paystack Balance to its operating bank by a scheduled **commission sweep** — only then is it recognised revenue. **[v2.1]**
5. On cancellation or dispute, the ledger drives refund or partial-release outcomes per the cancellation policy (see PRD §13).

> **How the hold works:** Paystack has no turnkey escrow product, so the flow is built from **Manual Payouts** (client payments stay in HireQuick's Paystack Balance instead of auto-settling to the bank) plus the **Transfers API** (releases each usher's share on verified attendance). Split Payments settle instantly and can't hold funds for a later event, so they don't fit. Both features need a **Registered Business** Paystack account. This is a deliberate correction from earlier drafts.

**Attendance verification.** Primary method is a **client-generated OTP** the usher enters on arrival; secondary is **QR scan**. Either transition moves the booking to *Checked In* and arms payout on event completion. **[v2.1]** So the "guaranteed payout" promise can't be broken by a passive client, the usher can also self-assert arrival, and a booking with an arrival (or check-in) **auto-completes at event end + a grace window** even if the client never confirms — the client's recourse is to dispute, not to silently withhold (see PRD §8, TRD §12).

> **Compliance flag:** because HireQuick (not Paystack) holds client funds in its Balance before remitting to staff, this may constitute regulated activity under CBN payment-services rules. Before processing real money, confirm with Paystack and counsel whether HireQuick operates as merchant-of-record within Paystack's licence or needs its own arrangement. This is a go/no-go item, not a detail.

---

## 8. Product Scope (v1)

**Mobile application** — role-based, one install, two modes: Client and Usher.

**Admin dashboard (web)** — user and verification management, dispute resolution, refund handling, escrow/ledger oversight, and platform analytics.

**Core features:** authentication, profile creation & identity verification, event creation, staff discovery, applications & invitations, multi-staff bookings, escrow payments, in-app messaging, attendance verification, reviews & ratings.

---

## 9. Long-Term Vision

HireQuick aims to become the default staffing infrastructure for events — starting with ushers in Lagos, then expanding by category (photographers, security, MCs, waiters, models, hospitality) and by city. Each new category reuses the same trust spine: verified people, escrowed money, verified attendance.

---

## 10. Success Metrics

These are launch **targets**, stated with the caveat that no baseline exists yet; the founding cohort exists partly to calibrate them. Each will be re-baselined after the first 100 completed bookings.

| Metric | Target | Note |
|---|---|---|
| Booking completion rate | ≥ 90% | Confirmed bookings reaching *Paid* |
| Repeat client rate (90-day) | ≥ 35% | Clients with ≥ 2 bookings |
| Median time-to-staffed | < 30 min | Event published → required headcount confirmed; "minutes" is aspirational pre-liquidity |
| No-show rate | < 5% | Confirmed staff failing verification |
| Median applications per open event | ≥ 5 | Liquidity proxy; supply-dependent |
| Escrow dispute rate | < 3% | Bookings entering dispute |

> Earlier drafts cited a < 2% no-show rate and < 10-min staffing as flat targets. Those are end-state ambitions, not launch realities for a cold-start marketplace; the numbers above are intentionally more conservative for v1.

---

## 11. Key Risks (summary)

| Risk | Mitigation |
|---|---|
| Thin staff supply at launch (cold start) | Manually recruit and verify a founding usher pool in Lagos before opening client signups; seed the first events |
| Fraudulent profiles | Mandatory identity verification before activation; admin review gate |
| Payment disputes & chargebacks | Escrow + attendance verification + defined dispute flow and evidence trail |
| No-shows | Escrow withholds payout; no-show penalties on usher reputation |
| Cancellation abuse (either side) | Tiered cancellation policy with windows and fault rules (PRD §13) |
| Regulatory exposure on held funds | Confirm merchant-of-record / licensing position with Paystack and counsel pre-launch |

A fuller risk register lives in the PRD.
