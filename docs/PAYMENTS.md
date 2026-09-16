# Payments, Escrow & the Ledger

> This is the most important subsystem in HireQuick. The invariants below are
> **not optional**. Read the referenced spec section before changing anything
> that touches money, escrow, policy, or a state transition.

This document covers: how money is represented, the append-only ledger, the full
escrow lifecycle, the Paystack boundary, the webhook pipeline, reconciliation,
idempotency, and concurrency.

---

## 1. Money is integer kobo

₦1 = 100 kobo. **Every** monetary value — DB columns, in-memory values, ledger
amounts — is an integer number of kobo (`Int`). **Never floats or `Decimal`.**

A fractional value would silently break the ledger's `Σ == 0` invariant. All
arithmetic goes through `@hq/shared/money`:

```ts
import { kobo, naira, splitFee, sumKobo, PLATFORM_FEE_BPS } from '@hq/shared';

naira(10_000);                 // → 1_000_000 kobo (₦10,000)
splitFee(kobo(1_000_000), PLATFORM_FEE_BPS); // → { fee: 150_000, payout: 850_000 }
```

`splitFee` floors the fee and gives the payout the **exact remainder**, so
`fee + payout === gross` always holds — no rounding leak. `PLATFORM_FEE_BPS` is
`1500` (15%).

---

## 2. The append-only ledger

Two tables are the source of truth. **Rows are never UPDATEd or DELETEd.**

- **`EscrowLedger`** — every movement of held funds (charge, release, refund,
  fee, commission sweep). `bookingId` is null for platform-level entries.
- **`WalletLedger`** — every movement of an usher's released, withdrawable
  balance.

Entry types (`@hq/shared/enums`):

| Ledger | Entry types |
| --- | --- |
| Escrow | `HOLD`, `RELEASE`, `REFUND`, `FEE`, `REVERSAL`, `COMMISSION_SWEEP` |
| Wallet | `CREDIT`, `DEBIT`, `REVERSAL` |

**The core invariant:** for a fully-resolved booking, its escrow entries sum to
**0** (`HOLD − RELEASE − FEE = 0`, or `HOLD − REFUND = 0`). A wallet's
`availableBalance` always equals the sum of its `WalletLedger` rows.

Only the ledger engine (`payments/ledger/ledger.ts`) writes these tables or
mutates wallet balances. Each function runs inside a caller-provided Prisma
transaction and takes row locks (see [Concurrency](#concurrency)).

---

## 3. Escrow lifecycle

The signs below are how amounts are stored in `EscrowLedger` (positive = money
in, negative = money out of the held pool).

```
CONFIRM BATCH                 client confirms accepted ushers
   │                          → Order (PENDING) + Bookings (PENDING_PAYMENT)
   ▼
CHARGE                        Paystack.initializeCharge(gross)
   │                          client pays on the hosted checkout
   ▼
charge.success WEBHOOK ───▶ holdOrder()
   │                          Order → PAID
   │                          per booking: EscrowLedger += HOLD(+amount)
   │                          Booking → CONFIRMED, Payment(escrow=HELD)
   │                          ─ invariant: Σ HOLD == order.grossAmount ─
   │
   ├── happy path ──────────▶ releaseBooking()  (client confirms, or auto-complete)
   │                          EscrowLedger += RELEASE(−payout) + FEE(−fee)
   │                          WalletLedger += CREDIT(+payout); wallet balance += payout
   │                          Payment(escrow=RELEASED)
   │                          Booking → COMPLETED → PAID
   │                          ─ booking escrow now sums to 0 ─
   │
   └── refund path ─────────▶ refundBooking()   (cancel / no-show / dispute)
                              EscrowLedger += REFUND(−amount)
                              Payment(escrow=REFUNDED); Booking → REFUNDED
                              Order → PARTIALLY_REFUNDED or REFUNDED
                              ─ booking escrow now sums to 0 ─
```

Key points:

- **RELEASE and FEE both leave escrow, but the money stays inside the Paystack
  Balance** — the payout moves to the usher's wallet (still platform-custodied),
  and the fee stays as platform revenue until the commission sweep. This is why
  RELEASE/FEE do **not** change the reconciliation expectation (see §6).
- **A frozen (disputed) booking cannot be released.** `releaseBooking` throws
  `LedgerError('FROZEN', …)` if `Payment.escrowStatus === 'FROZEN'`.
- **Partial refund of a batch:** refunding one booking moves only that booking
  to `REFUNDED` and the order to `PARTIALLY_REFUNDED`; sibling bookings are
  untouched. When all siblings are refunded the order becomes `REFUNDED`.
- **Loyalty milestones are evaluated at the completion chokepoint.** Every release
  path (manual complete, auto-complete, dispute-release) calls
  `rewards.evaluateMilestones(tx, usherId)` **inside the same transaction**, so an
  usher's lifetime completed-job count and any unlocked tiers update atomically
  with the payout. This involves no escrow/wallet movement — `ledger.ts` stays the
  sole writer of money; rewards only own the milestone tables.

Ledger functions (all in `payments/ledger/ledger.ts`):

| Function | Effect |
| --- | --- |
| `holdOrder(tx, orderId, chargeRef)` | HOLD every booking in the order into escrow; order → PAID. |
| `releaseBooking(tx, bookingId, method)` | RELEASE + FEE; credit usher wallet; booking → COMPLETED → PAID. |
| `refundBooking(tx, bookingId, amount)` | REFUND to client; booking → REFUNDED; recompute order status. |
| `markCheckedIn / markNoShow / cancelBooking` | Status precursors (no money movement). |
| `freezeBooking(tx, bookingId)` | Dispute: booking → DISPUTED, escrow → FROZEN. |
| `requestWithdrawal / completeWithdrawal / failWithdrawal` | Wallet → bank lifecycle (see §7). |
| `commissionSweep(tx, amount)` | COMMISSION_SWEEP platform-level entry (D3). |
| `reverseCommissionSweep(tx, amount)` | Positive COMMISSION_SWEEP compensating a returned transfer, guarded by the original operation lock. |

---

## 4. Wallet & withdrawals {#withdrawals}

When a booking is released, the usher's payout is credited to their `Wallet`
(`availableBalance`, backed by `WalletLedger`). To cash out:

```
requestWithdrawal()   lock wallet → check funds → create Withdrawal(PROCESSING)
        │             WalletLedger += DEBIT(−amount)   ← money leaves the wallet now
        ▼
Paystack.transfer()   fired by payments/service.initWithdrawal (idempotent)
        │
        ├─ transfer.success webhook ─▶ completeWithdrawal()  Withdrawal → PAID
        │                              (records paystackTransferRef)
        └─ transfer.failed  webhook ─▶ failWithdrawal()      Withdrawal → FAILED
                                       WalletLedger += REVERSAL(+amount)  ← funds returned
```

The wallet is debited **before** the transfer fires, and a failed transfer
reverses the debit — so a failure never loses the usher's money, and there is no
window where the same balance can be withdrawn twice (the row lock guarantees
exactly one of two racing withdrawals succeeds). `WITHDRAWAL_TRANSITIONS` makes
`FAILED` terminal. A confirmed reversal can move `PAID` to `FAILED` and restore
the balance once. A timeout, lost response, or pending provider result leaves
the withdrawal `PROCESSING` with its debit intact until authoritative settlement.

The API receipt returns the persisted status, amount, destination ID, and current
wallet balance. Mobile renders requested/pending/completed/failed separately.
An unresolved request's key and payload are saved in per-user SecureStore before
dispatch and reused after screen close or restart. A rejection on a later retry
cannot erase evidence that the first request may have been accepted.
Validated receipts also remain saved until the user presses Done. Receipt
acknowledgment and new submission are coordinated per user so closing a receipt
cannot erase a newer request. Response-contract failures after dispatch return
500 and preserve the original retry key.

---

## 5. The Paystack boundary (hexagonal port)

All Paystack access goes through one interface — `PaystackPort`
(`payments/port/paystack-port.ts`):

```ts
interface PaystackPort {
  initializeCharge(...)        // hosted checkout URL + reference
  verifyChargeKobo(reference)  // confirm a charge
  listBanks()                 // complete Nigerian bank directory
  resolveAccount(...)         // registered destination name
  createTransferRecipient(...) // register an usher bank account
  transfer(...)                // pay out / commission sweep
  verifyTransfer(reference)    // read authoritative transfer status
  refund(...)                  // refund a charge
  verifyRefund(...)            // read-only reconciliation of a refund intent
  getBalanceKobo()             // current Balance — reconciled daily
}
```

Two implementations:

- **`InMemoryPaystack`** — a no-network fake used by the test suite. Tracks a
  balance so reconciliation can be exercised; has test hooks
  (`creditBalance`, `failNextTransfer`, `setBalanceKobo`). This is how the entire
  ledger is tested with **no live keys**.
- **`HttpPaystack`** — the real client against the Paystack REST API, used in
  **TEST mode** (never live keys in dev/CI). Money is kobo end-to-end, matching
  the ledger.

The HTTP implementation validates response references, NGN currency and integer
amounts, imposes deadlines, and bounds bank/refund pagination. Unknown provider
statuses throw rather than being mistaken for a missing transfer. New charge
references use `hq-<order-id>`; existing stored references are retained on retry.

The app receives the port via dependency injection: `createApp({ paystack,
paystackSecret })`. The payments router and webhook mount only when a port is
provided.

---

## 6. The webhook pipeline

Paystack webhooks are the **source of truth** for money state — the API
initiates a charge, but the HOLD into escrow happens on the verified webhook.

Pipeline (`payments/webhooks/paystack-webhook.ts`), mounted with `express.raw`
**before** `express.json`:

```
POST /webhooks/paystack
   │
[1] verify HMAC-SHA512 signature over the RAW body
   │     bad signature → 401 BAD_SIGNATURE
[2] validate event shape  (bad → 400 BAD_PAYLOAD)
[3] dedupe charge references; lock transfer operation and financial target
[4] dispatch into the ledger:
        charge.success    → holdOrder()
        transfer.success  → completeWithdrawal() or commissionSweep()
        transfer.failed / transfer.reversed → compensation and FAILED operation
        refund.*          → read-only reconciliation of dispatched refund intents
   │
   └─ success or duplicate → 200   |   handler error → 500 (Paystack retries with backoff)
```

Signature verification uses `timingSafeEqual` over the raw buffer. A 500 on a
handler error is intentional: nothing is dropped silently — Paystack retries.
Transfer callbacks commit operation state and ledger effects together. Refund
callbacks cannot consume an undispatched intent's first attempt or create a new
refund. A terminal refund callback with unavailable read evidence returns 500.

---

## 7. Reconciliation — the operational alarm {#reconciliation}

`payments/ledger/reconciliation.ts` is the most important operational safeguard.
It recomputes the **expected** Paystack Balance from ledger aggregates and
compares it against the **real** balance:

```
expected = Σ HOLD  +  Σ REFUND(neg)  +  Σ COMMISSION_SWEEP(signed)  −  Σ withdrawalsPaid

drift = actual (Paystack.getBalanceKobo()) − expected
ok    = drift === 0
```

**RELEASE and FEE are deliberately absent from this formula** — they move money
from escrow into the wallet/revenue buckets but stay *inside* the Balance, so
they don't change it. If you add a new `LedgerEntryType` that moves money in or
out of the Paystack Balance, **you must update this formula.**

The job also flags `HELD` allocations nearing the **90-day Paystack Manual
Payouts rule** (default `staleAfterDays = 80`), returning
`staleHeldBookingIds` — so a long-held booking raises the alarm even when there
is no drift. The daily `reconcile` job (cron `17 3 * * *`) logs a
`⚠ RECONCILIATION ALARM` when `!ok`.

---

## 8. Idempotency

Money operations must be safe to retry.

- **HTTP layer:** money-mutating endpoints require an `Idempotency-Key` header
  (`requireIdempotencyKey`, min length 8). Missing → `400 IDEMPOTENCY_REQUIRED`.
- **Ledger layer:** `runIdempotent(prisma, key, scope, fn)` records the key in
  `IdempotencyKey` inside the transaction; a replay finds the existing key and
  returns `{ duplicate: true }` without re-running the effect.
- **Webhooks:** dedupe by Paystack event id/reference, so an at-least-once
  webhook delivery produces exactly one ledger effect.

Withdrawal keys additionally bind the caller and request fingerprint. Concurrent
replays serialize before lookup; a changed amount or bank under the same key
returns a conflict. Legacy results are adopted only after ownership and payload
checks. Other HTTP scopes retain their existing unbound format pending OVA-147.

Replaying a hold, a confirm, or a withdrawal therefore produces **exactly one**
effect.

### Durable external operations

`PaymentOperation` bridges database commits and provider calls. The request and
recovery worker use the same runner:

1. Commit the intent and its immutable amount/reference. Withdrawal intent shares
   the wallet-debit transaction; approval intent shares the checker decision.
   Refund intent reserves the booking under its row lock after checking the
   escrow balance and legal transitions. Release and attendance reject reserved
   bookings. Pending commission intents reserve fees across sweep periods.
2. Commit the dispatch attempt before contacting Paystack. Provider calls run
   outside database transactions. Later attempts reconcile the original intent.
3. Persist authoritative success as `PROVIDER_OK` in a separate transaction.
4. Lock and reread the operation, then commit its ledger effects and `RECORDED`
   together. A recording failure retains `PROVIDER_OK`; competing workers cannot
   append the same effects twice. Confirmed failure and wallet compensation also
   commit together.

Paystack transfer retries reuse the original reference after verification.
Refunds have a stricter boundary: once dispatch may have happened, recovery only
reads provider evidence. It resolves the charge to a transaction ID, pages refund
results, and validates the matching reference, amount, currency, and status.
A missing record after an ambiguous attempt remains pending for operator
reconciliation; it does **not** authorize another refund POST. This also means a
crash after the dispatch marker but before the POST needs operator review. Queued
refunds and pending transfers do not produce completed ledger entries. See the
[Paystack refund API](https://paystack.com/docs/api/refund/) and
[transfer lifecycle](https://paystack.com/docs/transfers/single-transfers/).

Approvals remain `APPROVED` until their action completes, then become `EXECUTED`.
Dispute release commits its payout and resolution together; refund intents carry
the resolution metadata into settlement. Recovery also reconstructs older
missing withdrawal/approval intents and repairs completed payouts/refunds whose
dispute metadata was stranded. Older uncertain refunds are reconciled without
blind reissue. A returned recorded sweep appends one positive COMMISSION_SWEEP
entry and marks its original operation FAILED; duplicate callbacks cannot repeat
the compensation. Durable notification delivery and operator triage remain
separate follow-up work.

---

## 9. Concurrency {#concurrency}

Prisma has no native row-lock API, so the ledger uses raw `SELECT … FOR UPDATE`
inside the transaction (`lockBooking`, `lockOrder`, `lockWallet`). This serializes
concurrent mutations of the same booking/order/wallet.

The canonical test (`payments/__tests__/concurrency.test.ts`) fires two parallel
withdrawals of the same balance from separate connections and asserts **exactly
one succeeds** — proving the `FOR UPDATE` lock holds.

When validating in an alternate schema, verify that raw SQL and Prisma queries
both target it. In the live database validation, `schema=<name>` alone did not
reliably route raw queries. Use the direct endpoint and an explicit connection
option `options=-c%20search_path%3D<name>`, then check `current_schema()` across
concurrent connections before running fixtures. Do not use the pooled endpoint
for migrations: session advisory locks can outlive the migration client.

---

## 10. Cancellation / no-show policy matrix {#policy-matrix}

Refund and payout outcomes are defined **once** in `@hq/shared/policy` so the
ledger, the (future) mobile app, and admin all compute identical results
(PRD §13). The matrix is keyed by **actor** (who cancelled) and **window** (how
far before the event):

| Window | Client cancels | Usher cancels |
| --- | --- | --- |
| `GT_48H` (>48h) | refund per row; minor flag | client 100% refund; minor flag |
| `BETWEEN_12_48H` | 100% client refund; usher penalty | client 100% refund; penalty |
| `LT_12H` (<12h) | 100% client refund; major penalty; suspend-if-repeat | client 100% refund; major penalty; suspend-if-repeat |

**No-show** (`NO_SHOW_OUTCOME`): usher confirmed but neither client-verified nor
self-asserted by `start + grace` → client refunded 100%, usher unpaid + major
penalty. Default grace is `DEFAULT_GRACE_MINUTES = 60`.

> **Pending:** whether the non-refundable Paystack processing fee is deducted
> from refunds (`lessProcessingFee`) is currently `false` everywhere and is
> **pending TRD §23 Q4** — do not hard-code a deduction until that is settled.

Every cancellation outcome's `clientRefundPct + usherPayoutPct` sums to 100 (a
tested invariant).

---

## 11. State machines

Bookings, orders, and withdrawals may only move along documented transitions
(`@hq/shared/state-machines`). Illegal moves throw `IllegalTransition` and the
ledger enforces them on every write.

**Booking:**
```
PENDING_PAYMENT → CONFIRMED | CANCELLED
CONFIRMED       → CHECKED_IN | CANCELLED | NO_SHOW | DISPUTED
CHECKED_IN      → COMPLETED | DISPUTED
COMPLETED       → PAID | DISPUTED
PAID            → DISPUTED            (post-payout dispute → clawback at resolution)
DISPUTED        → COMPLETED | REFUNDED | CANCELLED   (admin resolution targets)
CANCELLED       → REFUNDED
NO_SHOW         → REFUNDED
REFUNDED        → (terminal)
```

**Order:** `PENDING → PAID → PARTIALLY_REFUNDED → REFUNDED` (partial can loop).
**Withdrawal:** `REQUESTED → PROCESSING → PAID`; failure can enter `FAILED`,
including `PAID → FAILED` for a confirmed reversal. `FAILED` is terminal.

The tables are exported as data so tests can exhaustively check every
`(from, to)` pair.

---

## 12. Commission sweep (D3)

Platform fees accumulate in the Balance as the residue of releases. The daily
`commission` job (`23 4 * * *`) calls `runCommissionSweep`:

1. compute the sweepable amount; skip if below the ₦100 floor (`minKobo = 10_000`);
2. `Paystack.transfer(...)` to the operating bank recipient
   (`PAYSTACK_OPERATING_RECIPIENT`); skip the job if that env var is unset;
3. on success, record a `COMMISSION_SWEEP` escrow entry (which the reconciliation
   formula subtracts from the expected balance).

---

## Invariants checklist (do not break)

- [ ] All amounts are integer kobo. No floats, no `Decimal`.
- [ ] `EscrowLedger` / `WalletLedger` are append-only.
- [ ] Per booking, escrow entries sum to 0 at end of life.
- [ ] `wallet.availableBalance == Σ WalletLedger.amount`.
- [ ] `fee + payout == gross` (use `splitFee`).
- [ ] A new ledger entry type that changes the Paystack Balance is added to the
      reconciliation formula.
- [ ] A new state transition is added to its table **before** code performs it.
- [ ] Money-mutating endpoints require an `Idempotency-Key`.
