# HireQuick — Technical Requirements Document (TRD)

> **Pricing amendment — 26 September 2026:** new checkouts add a 15% client-paid platform fee to agreed staff pay. Ushers receive their full agreed pay. Cancellation percentages apply separately to staff pay and the added fee; the fee is refunded proportionally. Existing orders retain their recorded terms. See [client-paid fee policy](payments/client-paid-fee-policy-2026-09-26.md).


> **Policy amendment — approved 21 September 2026:** completion keeps funds in escrow until event end + 72 hours; undisputed completed bookings then become eligible for wallet release. Client cancellations use 100% / 50% / 0% refunds at >48h / 12–48h inclusive / <12h, with the former fee-deducted pricing (superseded for new checkouts by the 26 September amendment) and no processing-fee deduction from the refund. See the [approved decision and implementation criteria](payments/approved-settlement-policy-2026-09-21.md). Local implementation is tracked in OVA-136/137; see the [implementation and validation record](payments/settlement-implementation-2026-09-21.md). Deployment remains separately recorded.

**Version:** 2.1
**Prepared for:** HireQuick
**Prepared by:** Leslie Williams
**Launch market:** Lagos, Nigeria
**Status:** Pre-build

**v2.1 changes:** held-wallet payout model + new tables (`orders`, `wallets`, `wallet_ledger`, `bank_accounts`, `withdrawals`, `device_tokens`, `verification_codes`, `idempotency_keys`); event `end_time`; usher self-check-in + client-passive auto-complete; commission sweep; partial-refund-of-batch + scoped idempotency; transfer-failure fallback; NDPR retention periods; maker-checker on money; new API inventory (§24) and ledger test strategy (§25). Flagged inline as **[v2.1]**.

---

## 1. Introduction

This document defines the architecture, infrastructure, data model, APIs, integrations, and deployment strategy for HireQuick, with enough detail for engineering to estimate, build, test, and ship.

**v2 changes:** the data model now supports **multi-staff events** (event ↔ many bookings), an **escrow ledger** replaces the contradictory "split payments," booking/payment states cover **cancellation, no-show, dispute, and refund**, and provider/scale choices are made consistent with the PRD. Substantive changes flagged **[v2]**.

---

## 2. System Overview

Three systems:

- **Mobile app** (React Native / Expo) — role-based, Client + Usher.
- **Backend API** (Node/Express/TypeScript) — business logic, escrow ledger, payments, notifications, messaging, verification.
- **Admin dashboard** (web) — verification review, dispute resolution, escrow oversight, refunds, analytics.

---

## 3. System Architecture

```text
                 ┌─────────────────┐
                 │  Mobile App     │
                 │  React Native   │
                 └────────┬────────┘
                          │ HTTPS / WSS
                 ┌────────▼────────┐
                 │  API Gateway    │
                 │  Express + JWT  │
                 └────────┬────────┘
       ┌──────────┬───────┼────────┬───────────┐
       │          │       │        │           │
 ┌─────▼────┐ ┌───▼────┐ ┌▼──────┐ ┌▼────────┐ ┌▼──────────┐
 │ Escrow & │ │Notif.  │ │Messag.│ │Verif.   │ │Attendance │
 │ Payments │ │Service │ │Service│ │Service  │ │Service    │
 └─────┬────┘ └───┬────┘ └─┬─────┘ └┬────────┘ └┬──────────┘
       │          │        │        │           │
       └──────────┴────────┼────────┴───────────┘
                           │
                  ┌────────▼────────┐
                  │  PostgreSQL     │  ◄── escrow ledger is the source of truth
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  Paystack       │  (charges, transfers, webhooks)
                  └─────────────────┘
```

**[v2]** the Escrow & Payments service and the ledger in Postgres are now the architectural centre of gravity, not an afterthought bolted to a split-payment call.

---

## 4. Technology Stack

**Mobile:** React Native, Expo.
**Admin:** React, TypeScript, Vite, shadcn/ui.
**Backend:** Node.js, Express, TypeScript.
**ORM:** Prisma.
**Database:** PostgreSQL.
**Auth:** JWT + refresh tokens; phone OTP via a dedicated transactional OTP provider (e.g. Termii or Africa's Talking — Nigeria-focused) **[v2]**.
**Storage:** Backblaze B2 or AWS S3, signed URLs for all media and ID documents.
**Push:** Firebase Cloud Messaging.
**Email:** Resend.
**Realtime messaging:** Socket.IO.
**Payments:** Paystack, configured for **Manual Payouts** (funds held in Paystack Balance rather than auto-settled) plus the **Transfers API** for conditional release. This is the concrete mechanism behind the escrow flow — see §10. Requires a **Registered Business** Paystack account **[v2.1]**.
**Hosting:** containerized; Railway or Hetzner for v1, with a path to AWS if scale demands. Pick one for launch rather than listing three.

---

## 5. User Roles

`CLIENT`, `USHER`, `ADMIN` — enforced via RBAC (§16).

---

## 6. Database Design **[v2 — substantially revised]**

The central correction: **events and bookings are separate**, an event has a headcount, and each filled slot is one booking with its own payment and attendance. An **escrow ledger** records every movement of money.

### users
| field | type | notes |
|---|---|---|
| id | uuid | pk |
| role | enum | CLIENT / USHER / ADMIN |
| email | varchar | nullable |
| phone | varchar | unique, verified |
| password_hash | varchar | Argon2id |
| status | enum | ACTIVE / SUSPENDED / PENDING |
| created_at | timestamptz | |

### clients
| field | type |
|---|---|
| id | uuid (pk) |
| user_id | uuid (fk users) |
| display_name | varchar |
| rating_avg | numeric |
| rating_count | int |

### ushers
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid (fk users) | |
| bio | text | |
| years_experience | int | |
| verification_status | enum | PENDING / VERIFIED / REJECTED |
| reliability_score | numeric | derived from no-shows/late-cancels **[v2]** |
| rating_avg | numeric | |
| rating_count | int | |

### usher_verifications **[v2]**

Smile ID v3 / mobile v12 handles new biometric checks. The provider reference is an API-generated attempt ID; the ORM maps `providerReferenceId` to the existing `dojahReferenceId` column to retain history without a destructive rename. Only authenticated callbacks with a per-attempt secret URL and a matching server-fetched job result may settle the latest pending Smile attempt. `govLookup` stores only curated job/status signals, never raw IDs, photos, or provider payloads. See [integration details](../docs/SMILE-ID.md).

| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| usher_id | uuid (fk) | |
| id_document_url | varchar | signed-URL object |
| selfie_url | varchar | |
| status | enum | PENDING / APPROVED / REJECTED |
| reviewed_by | uuid (fk users) | admin |
| reason | text | on rejection |

### photos
| field | type |
|---|---|
| id | uuid (pk) |
| usher_id | uuid (fk) |
| image_url | varchar |

### availability
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| usher_id | uuid (fk) | |
| date | date | |
| status | enum | AVAILABLE / UNAVAILABLE / BUSY |

*(unique on usher_id+date)*

### events **[v2 — headcount + per-head budget]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| client_id | uuid (fk) | |
| title | varchar | |
| venue | varchar | |
| event_date | date | |
| start_time | time | |
| end_time | time | event end; drives client-passive auto-complete & event-day windows **[v2.1]** |
| category | varchar | |
| headcount | int | staff required **[v2]** |
| budget_per_head | numeric | **[v2]** |
| dress_code | varchar | |
| preferences | jsonb | optional gender/height/dress-size, audited **[v2]** |
| status | enum | DRAFT / OPEN / PARTIALLY_STAFFED / FULLY_STAFFED / IN_PROGRESS / COMPLETED / CANCELLED |

### applications
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| event_id | uuid (fk) | |
| usher_id | uuid (fk) | |
| status | enum | APPLIED / SHORTLISTED / ACCEPTED / REJECTED / WITHDRAWN |

### invitations
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| event_id | uuid (fk) | |
| usher_id | uuid (fk) | |
| status | enum | SENT / ACCEPTED / DECLINED / EXPIRED |

### bookings **[v2 — one per filled slot]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| event_id | uuid (fk) | |
| usher_id | uuid (fk) | |
| order_id | uuid (fk orders) | batch charge this booking was confirmed under **[v2.1]** |
| amount | integer kobo | full client allocation: agreed staff pay + platform fee |
| staff_pay | nullable integer kobo | immutable agreed pay at checkout; null identifies legacy fee-deducted pricing |
| status | enum | PENDING_PAYMENT / CONFIRMED / CHECKED_IN / COMPLETED / PAID / CANCELLED / NO_SHOW / DISPUTED / REFUNDED |
| attendance_method | enum | OTP / QR / AUTO / null **[v2.1]** (AUTO = client-passive auto-complete) |
| arrival_asserted_at | timestamptz | usher self-check-in; null until asserted **[v2.1]** |
| checked_in_at | timestamptz | client-verified arrival; null until verified |
| completed_at | timestamptz | set on client confirm OR auto-complete at event.end_time + grace **[v2.1]** |

### payments **[v2 — tied to booking + escrow]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| booking_id | uuid (fk) | |
| gross_amount | numeric | |
| platform_fee | integer kobo | floor(agreed staff pay × 15 / 100) |
| usher_payout | integer kobo | full agreed staff pay; gross − fee |
| paystack_charge_ref | varchar | denormalized from orders.paystack_charge_ref (one charge covers the batch) **[v2.1]** |
| paystack_transfer_ref | varchar | null in wallet model — the Paystack Transfer happens at withdrawal, not per booking; see `withdrawals` **[v2.1]** |
| escrow_status | enum | HELD / RELEASED / REFUNDED / FROZEN |

### escrow_ledger **[v2 — new, source of truth]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| booking_id | uuid (fk) | |
| entry_type | enum | HOLD / RELEASE / REFUND / FEE / REVERSAL / COMMISSION_SWEEP **[v2.1]** |
| amount | numeric | signed |
| balance_after | numeric | running escrow balance |
| paystack_ref | varchar | |
| created_at | timestamptz | immutable, append-only |

*Append-only. Reconciled daily against Paystack balance; the invariant is escrow_held = Σ HELD bookings.*

### disputes **[v2 — new]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| booking_id | uuid (fk) | |
| raised_by | uuid (fk users) | |
| reason | varchar | |
| note | text | |
| status | enum | OPEN / UNDER_REVIEW / RESOLVED |
| resolution | text | |
| resolved_by | uuid (fk users) | admin |

### conversations & messages **[v2 — scoped to booking]**
**conversations:** id, booking_id (fk), client_id, usher_id, created_at.
**messages:** id, conversation_id (fk), sender_id, content_type (TEXT/IMAGE/VOICE), content, flagged (bool, for PII/contact-sharing), created_at, seen_at.

*The v1 messages table (loose sender/receiver, no scope) couldn't enforce the per-booking unlock rule or retain dispute evidence; conversation scoping fixes both.*

### reviews **[v2 — two-way]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| booking_id | uuid (fk) | |
| reviewer_id | uuid (fk users) | |
| reviewee_id | uuid (fk users) | |
| rating | int | 1–5 |
| comment | text | optional |

### orders **[v2.1]**
*Aggregate for the single Paystack charge that confirms a batch of bookings. One order → N bookings; the charge lives here, not on each payment.*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| client_id | uuid (fk users) | |
| event_id | uuid (fk) | |
| paystack_charge_ref | varchar | the one charge covering the batch |
| gross_amount | numeric | Σ (staff pay + per-booking fee) over confirmed slots in this batch |
| status | enum | PENDING / PAID / PARTIALLY_REFUNDED / REFUNDED |
| created_at | timestamptz | |

> An event filled incrementally ("4 of 6") produces **one order per confirmation batch** — multiple orders per event are expected. Per-booking refunds/disputes resolve as **partial refunds against the order's charge** (see §10).

### wallets **[v2.1]**
*Held-balance model: completed usher payouts land here after event end + 72 hours, provided no unresolved dispute exists; usher withdraws to bank. Pending (in-escrow), including completed earnings before release, is derived from bookings, not stored here.*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| usher_id | uuid (fk users, unique) | |
| available_balance | numeric | released, withdrawable |
| currency | char(3) | NGN |
| updated_at | timestamptz | |

### wallet_ledger **[v2.1]**
*Append-only, mirrors escrow_ledger for the usher side.*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| wallet_id | uuid (fk) | |
| booking_id | uuid (fk, nullable) | source booking for CREDIT |
| withdrawal_id | uuid (fk, nullable) | source withdrawal for DEBIT |
| entry_type | enum | CREDIT (payout released) / DEBIT (withdrawal) / REVERSAL |
| amount | numeric | |
| balance_after | numeric | |
| created_at | timestamptz | |

### bank_accounts **[v2.1]**
*Paystack transfer recipients. Required before any withdrawal; see §23 Q3 (BVN / account-name verification).*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| usher_id | uuid (fk users) | |
| bank_code | varchar | Paystack bank code |
| account_number | varchar | |
| account_name | varchar | resolved via Paystack account-name lookup |
| paystack_recipient_code | varchar | from Transfers recipient API |
| verified | bool | |

### withdrawals **[v2.1]**
*Usher-initiated transfer of available wallet balance to a bank account. This is where the Paystack Transfer actually fires.*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| wallet_id | uuid (fk) | |
| bank_account_id | uuid (fk) | |
| amount | numeric | |
| status | enum | REQUESTED / PROCESSING / PAID / FAILED |
| paystack_transfer_ref | varchar | |
| failure_reason | text | null unless FAILED (invalid bank → funds stay in wallet, prompt user; see §10) |
| created_at | timestamptz | |

### device_tokens **[v2.1]**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid (fk) | |
| fcm_token | varchar | |
| platform | enum | IOS / ANDROID |
| last_seen_at | timestamptz | |

### verification_codes **[v2.1]**
*Short-TTL codes for auth OTP and attendance OTP. May be backed by Redis in implementation; modelled here for completeness.*
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| purpose | enum | AUTH / ATTENDANCE |
| subject_ref | varchar | phone (AUTH) or booking_id (ATTENDANCE) |
| code_hash | varchar | hashed, never stored plain |
| expires_at | timestamptz | |
| consumed_at | timestamptz | null until used |
| attempts | int | rate-limit counter |

### idempotency_keys **[v2.1]**
*Guards retried writes on money operations (charges, releases, refunds, transfers, webhooks).*
| field | type | notes |
|---|---|---|
| key | varchar (pk) | client- or system-supplied |
| scope | varchar | e.g. order_id, booking_id, paystack_event_id |
| response_hash | varchar | for safe replay |
| created_at | timestamptz | |

---

## 7. Authentication Flow

```text
User → API: request OTP (phone)
API → OTP Provider: send code
OTP Provider → User: 6-digit code
User → API: submit code
API: verify, create session
API → User: JWT + refresh token
```

Refresh tokens rotate; logout invalidates the refresh token; OTP requests are rate-limited per phone and per IP.

---

## 8. Event → Application Flow

```text
Client → API: create event (headcount N, budget/head)
API → DB: save event (status OPEN)
API → Notification: match & notify available verified ushers
Usher → API: apply
API → DB: save application
API → Client: "new application" (shows X applied / N needed)
```

---

## 9. Browse & Invite Flow

```text
Client → API: browse ushers (filters)
API → DB: fetch VERIFIED + AVAILABLE ushers
API → Client: profiles
Client → API: invite usher
API → DB: save invitation (SENT)
API → Usher: notification
Usher → API: accept (reserves slot, PENDING_PAYMENT)
```

---

## 10. Booking & Escrow Flow **[v2 — the core]**

**Mechanism [v2.1].** Paystack does **not** offer a turnkey conditional-escrow product where Paystack acts as a neutral arbiter. The hold-then-release behaviour is built from two Paystack features: **Manual Payouts** (when enabled, customer payments stay in HireQuick's Paystack Balance instead of auto-settling to the bank on the default T+1 schedule) and the **Transfers API** (initiates the per-usher payout from that balance on our trigger). HireQuick is therefore the party holding the funds — Paystack is the rails, not the escrow agent. This is exactly why the regulatory/merchant-of-record question (§23) is blocking rather than cosmetic.

```text
Client selects up to N accepted ushers
Client → API: confirm batch
API → DB: create ONE order (gross = Σ (staff pay + platform fee))            [v2.1]
API → Paystack: charge full amount (Σ per-head) under order
Paystack → API: charge.success (webhook)
        … Manual Payouts ON → funds stay in Paystack Balance, NOT auto-settled …
API → DB: order PAID; per booking → CONFIRMED, payment escrow_status HELD
API → escrow_ledger: append HOLD entries (one allocation per booking)
        … funds held in Balance; not revenue, not paid out …
[event day] attendance verified/auto-completed per booking → CHECKED_IN → COMPLETED
        … escrow remains HELD through event end + 72 hours …
[deadline reached, no unresolved dispute]
API → escrow_ledger: append RELEASE (→ usher wallet) + FEE entries   [v2.1]
API → DB: payment escrow_status RELEASED; booking PAID;
         wallet_ledger CREDIT (usher available_balance += payout)     [v2.1]
        … usher payout now a HELD wallet balance, still inside our Paystack Balance …
[on demand] Usher → API: withdraw(amount, bank_account)              [v2.1]
API → Paystack Transfers API: transfer from Balance → usher bank
Paystack → API: transfer.success → withdrawal PAID, wallet_ledger DEBIT
[scheduled] Commission sweep: COMMISSION_SWEEP ledger entry;          [v2.1]
API → Paystack Transfers API: accumulated FEE balance → HireQuick operating bank
```

**Payout is to an internal wallet, not straight to bank [v2.1].** After COMPLETED and event end + 72 hours, with no unresolved dispute, the booking's payout is *released into the usher's wallet* (a held balance still sitting in our Paystack Balance); the Paystack Transfer to the usher's bank fires only when the usher **withdraws** (see `withdrawals`). This matches the wallet UX (UXRD §7.6) and keeps one explicit "available vs pending" model. *Trade-off flagged:* holding usher balances is heavier regulatory ground than pass-through — this design is **pending the §23 Q7 answer** (with Q1 as the umbrella regulatory question); if counsel/Paystack require pass-through, collapse "withdraw" into an automatic transfer-to-bank on COMPLETED (booking → PAID lands in bank, `wallets`/`withdrawals` retire).

**Commission extraction [v2.1].** The 15% `platform_fee` recorded at RELEASE accumulates in the Paystack Balance — Manual Payouts means it does not auto-settle. A scheduled **commission sweep** transfers accumulated fees to HireQuick's operating bank and writes a `COMMISSION_SWEEP` ledger entry. The sweep is itself a Transfer, so it interacts with the 90-day rule and the regulatory position (§23 Q1); its mechanics are §23 Q8 — it is on the Paystack agenda, not assumed.

**Partial refund of a batch [v2.1].** Because one charge (the `order`) covers N bookings but bookings cancel/dispute individually, refunding a single booking is a **partial refund against the order's charge** for that booking's allocation; the order moves to `PARTIALLY_REFUNDED` and remaining bookings are untouched.

**Webhooks consumed:** `charge.success`, `transfer.success`, `transfer.failed`, `refund.processed`. `transfer.failed` retries with backoff and alerts ops; nothing is dropped silently. A withdrawal `transfer.failed` (e.g. invalid bank details) leaves the funds in the usher's wallet, marks the withdrawal `FAILED` with reason, and prompts the usher to fix their bank account — the usher is never left worked-but-unpaid. **[v2.1]**

**Idempotency [v2.1]:** every Paystack interaction carries an idempotency key scoped to the relevant entity (`order_id` for charges, `booking_id` for releases, `withdrawal_id` for payout transfers, `paystack_event_id` for inbound webhooks) — stored in `idempotency_keys` — to survive retries and avoid double-charge/double-pay. Keying solely on `booking_id` was insufficient once one charge spans many bookings.

**Manual Payouts 90-day rule [v2.1].** Held balances must see at least one transfer initiated within 90 days or Paystack auto-settles the balance to the bank (a regulatory guardrail ensuring the balance is used only for Transfers). For event staffing, escrow lifetimes are days-to-weeks, so this never binds in normal operation — but the reconciliation job (§17) treats "no stale HELD balance approaching 90 days" as a monitored invariant.

**Transfers vs subaccounts [v2.1].** The payout uses the **Transfers API**, not Paystack subaccounts, deliberately. A subaccount's *first* payout is delayed indefinitely pending a one-time manual verification — acceptable for a fixed set of vendors, but unworkable for a marketplace onboarding new ushers constantly. Transfers to a verified recipient bank account avoid that per-usher friction. (Subaccount-based split settlement is reconsiderable later if the operational picture changes.)

---

## 11. Cancellation / Refund / Dispute Engine **[v2 — new]**

A booking cancellation evaluates time-to-event against the policy matrix (PRD §13) and emits the corresponding ledger entries:

```text
cancel(booking):
  window = event_start − now
  (refund_pct, payout_pct, reputation_delta) = policy(window, who_cancelled)
  staff_refund = floor(refund_pct × staff_pay / 100)
  fee_refund = floor(refund_pct × platform_fee / 100)
  refund = staff_refund + fee_refund
  payout = staff_pay − staff_refund
  fee = platform_fee − fee_refund
  # Legacy orders use their original fee-deducted allocation.
  reserve immutable settlement; apply existing approval/audit controls
  confirm Paystack refund if refund > 0; recover uncertain outcomes
  ledger.append(REFUND, −refund)
  ledger.append(RELEASE, −payout); wallet CREDIT payout
  ledger.append(FEE, −fee)
  assert refund + payout + fee == amount
  apply reputation_delta to usher.reliability_score
  booking.status = CANCELLED | NO_SHOW | REFUNDED
```

**Dispute:** before event end + 72 hours, opening a dispute on a held booking (including `COMPLETED`) sets the booking's payment `escrow_status = FROZEN` (no release, no refund) until an admin resolves it; resolution records the outcome under existing approval/audit controls. An usher-favour decision before the deadline restores `COMPLETED` / `HELD`; it does not bypass the deadline. Release and dispute admission must check the deadline and current state under the same lifecycle lock. Existing released funds are not clawed back or credited again. Chat and attendance logs are linked automatically as evidence.

---

## 12. Attendance Verification

**Primary — OTP:** client taps *Generate*; backend issues a 6-digit code bound to a specific booking with a short TTL (stored hashed in `verification_codes`); usher submits it; on match the booking → `CHECKED_IN`. **Per booking**, so multi-staff events verify each usher independently.
**Secondary — QR:** client displays a booking-bound QR; usher scans; same transition.

**Usher self-check-in & client-passive auto-complete [v2.1].** Attendance must not depend solely on the client acting, or a passive/withholding client could deny a working usher their payout (the core "guaranteed payout" promise). So:
- The usher can **assert arrival** ("I've arrived" → `arrival_asserted_at`) independently of the client's OTP/QR.
- If a booking has an asserted arrival (or a verified `CHECKED_IN`) and the client never confirms completion, the booking **auto-completes at `event.end_time + grace` (default 60 min)** with `attendance_method = AUTO`, retaining escrow until event end + 72 hours. The release worker then credits the wallet only if no unresolved dispute exists.
- The client's recourse against a false arrival claim is the **existing 72h dispute flow** (§11) — escrow frozen, evidence reviewed — *not* silent withholding. This flips the default from "no payout unless the client acts" to "payout unless the client disputes."

**No-show** is the inverse and anchors on **start**: a `CONFIRMED` booking with **no** verified check-in and **no** asserted arrival by `event.start_time + grace` → `NO_SHOW`, client refunded 100%, usher penalised (§11). (Two distinct windows: no-show is judged at *start + grace* — they didn't turn up to work; auto-complete fires at *end + grace* — work done, client passive. `end_time` exists to drive the latter.)

Status path: `CONFIRMED → CHECKED_IN → COMPLETED → PAID`, where `COMPLETED` is reached by client confirmation **or** the auto-complete trigger above, and `PAID` means the payout has been released into the usher's wallet (withdrawal to bank is a separate wallet action, §10).

---

## 13. Notifications

**Push:** Firebase Cloud Messaging. **Email:** Resend. **OTP:** dedicated transactional provider (separate from notifications).
**Events:** application received, invitation received, booking confirmed, funds held, attendance pending, attendance verified, payout released, withdrawal successful, review requested, verification approved/rejected, cancellation notice, dispute opened/resolved.

---

## 14. Security

Argon2id password hashing; JWT access + rotating refresh tokens; RBAC; per-endpoint rate limiting; append-only audit logs (auth, payments, escrow, admin actions); signed upload/download URLs for all media and ID documents; encryption at rest; least-privilege access to verification documents. ID documents are treated as the most sensitive class and access is logged.

**PII retention & deletion (NDPR) [v2.1].** Concrete defaults (configurable by ops, to be confirmed in counsel review — §23 item 9):
- **ID documents & verification selfies:** retained only while needed for verification + dispute window; **deleted within 90 days of account verification** (or 30 days of rejection). Only a pass/fail flag and reviewer/audit record are kept long-term, not the raw document.
- **Identity & transaction records** (KYC trail, ledger, payments): retained **7 years** to satisfy financial-record obligations, then purged.
- **Chat/media:** retained for the booking's dispute window + **180 days**, then eligible for deletion.
- **Account deletion request:** PII erased or irreversibly anonymised within **30 days**, except records under the 7-year financial-retention rule, which are anonymised at the end of that window.
Deletion is driven by a scheduled job; every deletion is itself audit-logged.

---

## 15. RBAC Matrix

| Feature | Client | Usher | Admin |
|---|---|---|---|
| Create event | ✓ | ✕ | ✕ |
| Apply to event | ✕ | ✓ | ✕ |
| Invite staff | ✓ | ✕ | ✕ |
| Confirm & pay (escrow) | ✓ | ✕ | ✕ |
| Verify attendance (OTP/QR) | ✓ | ✕ | ✕ |
| Assert arrival (self-check-in) **[v2.1]** | ✕ | ✓ | ✕ |
| Withdraw payout | ✕ | ✓ | ✕ |
| Messaging (own bookings) | ✓ | ✓ | read for disputes |
| Leave review | ✓ | ✓ | ✕ |
| Approve verifications | ✕ | ✕ | ✓ |
| Process refunds | ✕ | ✕ | ✓ (maker) |
| Resolve disputes | ✕ | ✕ | ✓ (maker) |
| Approve money movements above threshold **[v2.1]** | ✕ | ✕ | ✓ (checker — second admin) |
| Suspend accounts | ✕ | ✕ | ✓ |
| View escrow ledger | ✕ | ✕ | ✓ |

**Maker-checker on money [v2.1].** No single admin can move funds unilaterally. Refunds and dispute payouts **above a configurable threshold** require a second admin (the *checker*) to approve before execution; below the threshold a single admin may act but every action is append-only audit-logged. This adds segregation of duties to the audit trail for the highest-risk admin powers.

---

## 16. CI/CD

GitHub repository; GitHub Actions pipeline; Docker images; environments Development / Staging / Production. Migrations run via Prisma in the pipeline with a manual gate to production.

---

## 17. Monitoring

Sentry (errors), BetterStack (uptime), PostHog (product analytics). **Escrow reconciliation job** runs daily and alerts on any drift between ledger and Paystack balance — this is the single most important operational alarm. **[v2]**

---

## 18. Backup Strategy

Daily database backup, weekly snapshot, 30-day retention. The escrow ledger is append-only and backed up with point-in-time recovery, given it is the financial source of truth. **[v2]**

---

## 19. Performance Targets

| Metric | Target |
|---|---|
| API response (p95) | < 500ms |
| App cold start | < 2s (mid-range Android) |
| Push delivery | < 5s |
| Concurrent users (launch capacity) | 5,000, architected to scale to 50,000 |

**[v2]** aligns concurrency with the PRD (registered-user vs concurrent are now distinct, consistent figures) rather than asserting a single ambiguous number.

---

## 20. Future Enhancements

Semi-automated emergency replacement, AI match scoring/ranking, saved favourite ushers, corporate and agency accounts, SMS notifications, dynamic pricing, additional categories, multi-city.

---

## 21. Suggested Repository Structure

```text
hirequick/
  apps/
    mobile/      # React Native (Expo)
    admin/       # React + Vite
  packages/
    ui/          # shared components
    shared/      # types, validation, policy matrix
    database/    # Prisma schema + migrations
  services/
    auth/
    payments/    # escrow ledger + Paystack
    messaging/
    notifications/
    verification/
```

**[v2]** adds a `verification` service and locates the cancellation/dispute **policy matrix** in `packages/shared` so client, server, and admin enforce one source of truth.

---

## 22. Recommended MVP Team

1 product designer, 1 React Native engineer, 1 backend engineer (owns escrow/ledger), 1 QA tester, 1 product manager. Given escrow is the riskiest surface, the backend engineer's first deliverable is the ledger + reconciliation, built and tested before any client-facing payment UI. **[v2]**

---

## 23. Paystack Call Agenda & Open Questions (resolve before build) **[v2.1]**

**Hard dependency to settle first:** HireQuick must operate a **Registered Business** Paystack account. Manual Payouts and the Transfers API are both gated to Registered Businesses (not Starter), and Manual Payouts must be explicitly enabled by emailing support@paystack.com or via Paystack's contact form. This applies to the launch entity (e.g. Ovalay Digital Limited). Nothing in the escrow flow works without it, so registration + feature enablement is a sequencing prerequisite, not a parallel task.

Take these to the Paystack conversation as a structured agenda:

| # | Question to Paystack | Why it blocks / what it decides | Severity |
|---|---|---|---|
| 1 | Given we hold client funds in our Balance via Manual Payouts and release per attendance, what is our **regulatory/merchant-of-record position**? Do we operate within your licence, or do we need our own (e.g. CBN PSP/PSSP) authorisation? | Determines whether the whole hold-then-release model is permitted as designed, or needs restructuring. | **Blocking** |
| 2 | Confirm **Manual Payouts** can be enabled for our Registered Business in Nigeria, and confirm the **90-day** active-transfer rule and any balance ceiling. | Confirms the core hold mechanism exists for us and bounds how long escrow can sit. | **Blocking** |
| 3 | For **Transfers API** payouts to ushers: what **KYC/recipient verification** is required before an usher can receive a transfer (BVN, account-name match, limits)? | Shapes usher onboarding — a transfer that can't land breaks the payout promise. | High |
| 4 | **Refund** timing and fees on `refund.processed`: are the original processing fees recoverable on refund? | Determines provider costs and reconciliation treatment. Product approved no deduction from client refunds on 21 September 2026; fee recovery does not change that refund promise. | High |
| 5 | Transfer **fees and per-transfer/daily limits** at our expected volume. | Feeds unit economics on the 15% commission. | Medium |
| 6 | Is there a **Paystack-native marketplace/escrow** product on the roadmap we should evaluate instead of building the ledger ourselves? | Could simplify the build if a managed option exists for our case. | Medium |
| 7 | **Holding usher balances (wallet model):** is it acceptable under your licence for usher payouts to sit as a *withdrawable balance* in our Balance until the usher withdraws, or must each payout transfer straight to the usher's bank on release? **[v2.1]** | Decides D2 — whether the held-wallet design stands or collapses to pass-through transfer on completion. | **Blocking** |
| 8 | **Commission sweep:** can we periodically transfer our accumulated platform-fee balance to our own operating bank, and how does that interact with the 90-day rule and any balance ceiling? **[v2.1]** | Confirms how/when 15% commission becomes recognised revenue rather than sitting in Balance. | High |

**Independent of Paystack:**

9. **Data residency, retention & NDPR:** where do PII and ID-verification documents physically live, does that satisfy the Nigeria Data Protection Regulation, and confirm the concrete retention/deletion periods in §14. (Eng + counsel.) **[v2.1]**

These are listed so they're owned and sequenced, not discovered mid-build. Items 1 and 2 gate the start of payment work entirely.

---

## 24. API Surface (v1 inventory) **[v2.1]**

Not full request/response schemas — a build-estimable inventory so the endpoint set is explicit before sprint planning. REST/JSON, JWT-authenticated unless noted. Money-mutating endpoints (★) require an `Idempotency-Key` header (see `idempotency_keys`, §6).

**Auth:** `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/password/reset` · `POST /auth/refresh` · `POST /auth/logout`
**Profile & verification:** `GET/PATCH /me` · `POST /me/verification` (ID + selfie upload) · `GET /me/verification` · admin `POST /admin/verifications/:id/{approve,reject}`
**Discovery:** `GET /ushers` (filters: availability, location, rating, price) · `GET /ushers/:id` · `GET /events` (usher-facing) · `GET /events/:id`
**Events:** `POST /events` · `PATCH /events/:id` · `POST /events/:id/cancel` · `GET /events/:id/applications`
**Applications & invitations:** `POST /events/:id/apply` · `PATCH /applications/:id` (shortlist/accept/reject) · `POST /events/:id/invite` · `PATCH /invitations/:id` (accept/decline)
**Bookings & payment:** ★`POST /orders` (confirm batch → Paystack charge) · `GET /orders/:id` · `GET /bookings` · `GET /bookings/:id` · ★`POST /bookings/:id/cancel`
**Attendance:** `POST /bookings/:id/checkin/generate` (client OTP/QR) · `POST /bookings/:id/checkin/verify` · `POST /bookings/:id/arrived` (usher self-check-in, §12) · `POST /bookings/:id/complete`
**Wallet & payout:** `GET /wallet` · `GET /wallet/ledger` · `POST /bank-accounts` · `GET /bank-accounts` · ★`POST /withdrawals` · `GET /withdrawals`
**Reviews:** `POST /bookings/:id/review` · `GET /ushers/:id/reviews`
**Disputes:** ★`POST /bookings/:id/disputes` · `POST /disputes/:id/evidence` · admin ★`POST /admin/disputes/:id/resolve`
**Messaging:** `GET /conversations` · `GET /conversations/:id/messages` · `POST /conversations/:id/messages` (Socket.IO for realtime)
**Admin:** `GET /admin/ledger` · ★`POST /admin/refunds` · `POST /admin/users/:id/{suspend,reinstate}` · admin checker `POST /admin/approvals/:id` (maker-checker, §15)
**Webhooks (unauthenticated, signature-verified):** `POST /webhooks/paystack` (`charge.success`, `transfer.success`, `transfer.failed`, `refund.processed`)

## 25. Ledger Test Strategy **[v2.1]**

The escrow + wallet ledgers are the riskiest surface (§22 makes them the backend engineer's first deliverable, built and tested before any payment UI). Minimum test coverage before live funds:

- **Invariants (property-based):** for every booking, `Σ ledger entries == 0` across HOLD/RELEASE/FEE/REFUND/REVERSAL/COMMISSION_SWEEP; escrow `HELD` total + released + refunded always reconciles to the order's charged amount; `wallet.available_balance == Σ wallet_ledger` for every wallet; no booking can be `PAID` without a matching RELEASE; no negative wallet balance.
- **State-machine tests:** every booking/order/withdrawal transition is exercised, and **illegal transitions are rejected** (e.g. RELEASE on a `DISPUTED` booking, double-withdrawal of the same balance, refund of an already-refunded allocation).
- **Idempotency & webhook replay:** duplicate `charge.success`/`transfer.success` and retried client requests with the same `Idempotency-Key` produce exactly one ledger effect.
- **Partial-refund-of-batch:** refunding one booking in an N-booking order leaves the other N-1 allocations intact and moves the order to `PARTIALLY_REFUNDED`.
- **Reconciliation simulation:** the daily job (§17) is unit-tested against seeded drift (a transfer that fired but whose webhook was lost, a stale `HELD` allocation nearing 90 days) and must alarm.
- All money tests run against a Paystack **test** environment in CI; no test touches live keys.
