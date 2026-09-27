# Payments, Escrow & the Ledger

> This is the most important subsystem in HireQuick. The invariants below are
> **not optional**. Read the referenced spec section before changing anything
> that touches money, escrow, policy, or a state transition.

This document covers: how money is represented, the append-only ledger, the full
escrow lifecycle, the Paystack boundary, the webhook pipeline, reconciliation,
idempotency, and concurrency.

[Documentation index](README.md) · [API](API.md) · [Operations](OPERATIONS.md) · [Current limitations](STATUS.md)

Reviewed against current implementation on 2026-09-16; approved settlement behavior updated on 2026-09-21. The [implementation record](../documentation/payments/settlement-implementation-2026-09-21.md) distinguishes local validation from deployment and provider certification.

---

## 1. Money is integer kobo

₦1 = 100 kobo. **Every** monetary value — DB columns, in-memory values, ledger
amounts — is an integer number of kobo (`Int`). **Never floats or `Decimal`.**

A fractional value would silently break the ledger's `Σ == 0` invariant. All
arithmetic goes through `@hq/shared/money`:

```ts
import { kobo, naira, priceBooking, sumKobo, PLATFORM_FEE_BPS } from '@hq/shared';

naira(10_000); // → 1_000_000 kobo (₦10,000)
priceBooking(kobo(1_000_000)); // → { gross: 1_150_000, fee: 150_000, payout: 1_000_000 }
```

`priceBooking` adds a floored 15% fee to the full staff pay. `Booking.staffPay` snapshots the agreed pay; `Booking.amount` is the client gross. `bookingAllocation` preserves the old `splitFee` calculation only for legacy rows with null `staffPay`. `fee + payout === gross` always holds. See the [26 September policy](../documentation/payments/client-paid-fee-policy-2026-09-26.md).

---

## 2. The append-only ledger

Two tables are the source of truth. **Rows are never UPDATEd or DELETEd.**

- **`EscrowLedger`** — every movement of held funds (charge, release, refund,
  fee, commission sweep). `bookingId` is null for platform-level entries.
- **`WalletLedger`** — every movement of an usher's released, withdrawable
  balance.

Entry types (`@hq/shared/enums`):

| Ledger | Entry types                                                        |
| ------ | ------------------------------------------------------------------ |
| Escrow | `HOLD`, `RELEASE`, `REFUND`, `FEE`, `REVERSAL`, `COMMISSION_SWEEP` |
| Wallet | `CREDIT`, `DEBIT`, `REVERSAL`                                      |

**The core invariant:** for a fully-resolved booking, its escrow entries sum to
**0** (`HOLD − RELEASE − FEE = 0`, or `HOLD − REFUND = 0`). A wallet's
`availableBalance` always equals the sum of its `WalletLedger` rows.

Only the ledger engine (`payments/ledger/ledger.ts`) writes these tables or
mutates wallet balances. Each function runs inside a caller-provided Prisma
transaction and takes row locks (see [Concurrency](#concurrency)).

---

## 3. Escrow lifecycle

Checkout is durable: the 30-minute reservation, initialization attempt, original reference, and recovery status live in `Checkout`. Unknown provider evidence retains a reservation under review; time alone does not prove nonpayment. Late payment after conclusive expiry is held only for refund recovery and does not confirm staff. See [checkout API states](API.md#checkout-and-payments) and [checkout recovery source](../apps/api/src/modules/payments/checkout.ts).

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
   ├── completion ─────────▶ completeBookingHeld() (client confirms, or auto-complete)
   │                          Booking → COMPLETED; escrow remains HELD
   │                          Wait until event end (Lagos) + 72 hours, no open dispute
   ├── eligible release ────▶ releaseBooking()
   │                          EscrowLedger += RELEASE(−payout) + FEE(−fee)
   │                          WalletLedger += CREDIT(+payout); wallet balance += payout
   │                          Payment(escrow=RELEASED)
   │                          Booking → PAID
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
- **Loyalty milestones are evaluated at eligible wallet release.** Every release
  path (manual complete, auto-complete, dispute-release) calls
  `rewards.evaluateMilestones(tx, usherId)` **inside the same transaction**, so an
  usher's lifetime completed-job count and any unlocked tiers update atomically
  with the payout. This involves no escrow/wallet movement — `ledger.ts` stays the
  sole writer of money; rewards only own the milestone tables.

Ledger functions (all in `payments/ledger/ledger.ts`):

| Function                                                  | Effect                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `holdOrder(tx, orderId, chargeRef)`                       | HOLD every booking in the order into escrow; order → PAID.                                          |
| `completeBookingHeld(tx, bookingId, method)` | Record COMPLETED; retain HELD escrow and no wallet credit. |
| `releaseBooking(tx, bookingId, method)` | At/after event end + 72h, with no unresolved dispute: RELEASE + FEE, wallet credit, booking → PAID. |
| `settleClientCancellation(tx, bookingId, operationId, snapshot)` | Finalize the approved immutable refund/net payout/fee split after provider confirmation. |
| `refundBooking(tx, bookingId, amount)`                    | REFUND to client; booking → REFUNDED; recompute order status.                                       |
| `markCheckedIn / markNoShow / cancelBooking`              | Status precursors (no money movement).                                                              |
| `freezeBooking(tx, bookingId)`                            | Dispute: booking → DISPUTED, escrow → FROZEN.                                                       |
| `requestWithdrawal / completeWithdrawal / failWithdrawal` | Wallet → bank lifecycle (see §7).                                                                   |
| `commissionSweep(tx, amount)`                             | COMMISSION_SWEEP platform-level entry (D3).                                                         |
| `reverseCommissionSweep(tx, amount)`                      | Positive COMMISSION_SWEEP compensating a returned transfer, guarded by the original operation lock. |

---

<a id="withdrawals"></a>

## 4. Wallet & withdrawals

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
  verifyCheckout(reference)    // checkout recovery evidence (where implemented)
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

Verified provider evidence establishes money outcomes. The API initiates a charge; authenticated callbacks and checkout recovery through verified provider reads can both record the HOLD. A browser return or a successful initialization response cannot establish payment.

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

<a id="reconciliation"></a>

## 7. Reconciliation — the operational alarm

`payments/ledger/reconciliation.ts` is the most important operational safeguard.
It recomputes the **expected** Paystack Balance from ledger aggregates and
compares it against the **real** balance:

```
expected = Σ HOLD  +  Σ REFUND(neg)  +  Σ COMMISSION_SWEEP(signed)  −  Σ withdrawalsPaid

drift = actual (Paystack.getBalanceKobo()) − expected
ok    = drift === 0 AND staleHeldBookingIds is empty
```

**RELEASE and FEE are deliberately absent from this formula** — they move money
from escrow into the wallet/revenue buckets but stay _inside_ the Balance, so
they don't change it. If you add a new `LedgerEntryType` that moves money in or
out of the Paystack Balance, **you must update this formula.**

The job also flags `HELD` allocations nearing the **90-day Paystack Manual
Payouts rule** (default `staleAfterDays = 80`), returning
`staleHeldBookingIds` — so a long-held booking raises the alarm even when there
is no drift. The daily `reconcile` job (cron `17 3 * * *`) logs a
`⚠ RECONCILIATION ALARM` when `!ok`.

---

<a id="idempotency"></a>

## 8. Idempotency

Money operations must be safe to retry.

- **HTTP layer:** confirmation, charge, withdrawal, booking completion/cancellation, and erasure routes require an `Idempotency-Key` header
  (`requireIdempotencyKey`, min length 8). Missing → `400 IDEMPOTENCY_REQUIRED`.
- **Ledger layer:** `runIdempotent(prisma, key, scope, fn)` records the key in
  `IdempotencyKey` inside the transaction; a replay finds the existing key and
  returns the stored outcome with a duplicate marker without repeating the guarded effect. Entity-based operations also use row locks and state guards; see the [API route tables](API.md) for where the header is enforced.
- **Webhooks:** dedupe by Paystack event id/reference, so an at-least-once
  webhook delivery produces exactly one ledger effect.

Withdrawal keys additionally bind the caller and request fingerprint. Concurrent
replays serialize before lookup; a changed amount or bank under the same key
returns a conflict. Legacy results are adopted only after ownership and payload
checks. Confirmation also binds the caller/event and selected applications in its service. Do not assume every remaining HTTP scope has equivalent payload-bound replay; inspect the specific service before extending it.

The relevant ledger/state and replay guards prevent duplicate financial effects. An uncertain provider result can remain pending; idempotency does not guarantee immediate completion.

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
An usher-favour dispute decision restores COMPLETED/HELD and commits its resolution atomically. It releases to the wallet in that transaction only if the 72-hour deadline has elapsed; otherwise the worker releases later. Refund intents carry the resolution metadata into settlement. Recovery also reconstructs older
missing withdrawal/approval intents and repairs completed payouts/refunds whose
dispute metadata was stranded. Older uncertain refunds are reconciled without
blind reissue. A returned recorded sweep appends one positive COMMISSION_SWEEP
entry and marks its original operation FAILED; duplicate callbacks cannot repeat
the compensation. Durable notification delivery and operator triage remain
separate follow-up work.

---

<a id="concurrency"></a>

## 9. Concurrency

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

<a id="policy-matrix"></a>

## 10. Cancellation / no-show policy matrix

Refund and payout outcomes are defined **once** in `@hq/shared/policy` so the
API and mobile can share the same policy data
(PRD §13). The matrix is keyed by **actor** (who cancelled) and **window** (how
far before the event):

| Window                              | Client cancellation policy: refund / usher compensation | Usher cancellation policy                                 |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `GT_48H` (>48h)                     | 100% / 0%; no usher reputation penalty                  | 100% client refund; minor flag                            |
| `BETWEEN_12_48H` (12–48h inclusive) | 50% / 50%; no usher reputation penalty                  | 100% client refund; penalty                               |
| `LT_12H` (<12h)                     | 0% / 100%; no usher reputation penalty                  | 100% client refund; major penalty; suspend-if-repeat flag |

**Implemented settlement:** the first accepted client request reserves the booking and persists its time, event start, window and all amounts. Late requests must confirm the displayed window/refund; stale quotes return `CANCELLATION_QUOTE_CHANGED`. For new bookings, each component (staff pay and the added fee) is refunded at the policy percentage, rounded down independently. Retained staff pay goes fully to the usher and the retained fee to HireQuick. Legacy orders and V1 cancellation receipts preserve the prior split. Refund + net payout + fee equals the original gross, including odd kobo.

Gross booking allocations above 5,000,000 kobo require two distinct admins, including zero-refund cancellations. The original request remains reserved during approval/rejection and can be reproposed; a rejected approval does not change the accepted quote. Recovery and ledger finalization both verify approval. Provider uncertainty leaves all funds held. Confirmed settlement appends REFUND (when positive), RELEASE and FEE and a wallet CREDIT exactly once. Zero-refund cancellations skip the provider refund entirely. Full refunds end REFUNDED; compensation-bearing cancellations end CANCELLED with payment escrow RELEASED. The original Payment allocation is historical; cancellation summaries and ledger entries report actual settlement. Ordinary admin refunds still require the full eligible booking amount and cannot replace a cancellation reservation.

**No-show** (`NO_SHOW_OUTCOME`): usher confirmed but neither client-verified nor
self-asserted by `start + grace` → client refunded 100%, usher unpaid + major
penalty. Default grace is `DEFAULT_GRACE_MINUTES = 60`.

No processing fee is deducted from client refunds (`DEDUCT_PROCESSING_FEE_ON_REFUND = false`). HireQuick bears unrecovered processing/refund charges. Account-specific provider fees and reconciliation evidence remain open under OVA-166; product approval is not provider certification.

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
PAID            → (terminal; post-payout disputes currently blocked)
DISPUTED        → COMPLETED | REFUNDED | CANCELLED   (admin resolution targets)
CANCELLED       → REFUNDED
NO_SHOW         → REFUNDED
REFUNDED        → (terminal)
```

**Order:** `PENDING → PAID → PARTIALLY_REFUNDED → REFUNDED` (partial can loop).
**Withdrawal:** `REQUESTED → PROCESSING → PAID`; failure can enter `FAILED`,
including `PAID → FAILED` for a confirmed reversal. `FAILED` is terminal.

The shared deadline is scheduled event end in Africa/Lagos + 72 elapsed hours. HELD bookings may enter dispute strictly before it; completed bookings become eligible for release at it. Ledger lifecycle locks serialize dispute/release checks. PAID and historical RELEASED funds cannot be frozen, refunded again or clawed back by this policy. The UI identifies them as already released and directs exceptional cases to support.

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
- [ ] `fee + payout == gross` (use `priceBooking`; `bookingAllocation` preserves legacy terms).
- [ ] A new ledger entry type that changes the Paystack Balance is added to the
      reconciliation formula.
- [ ] A new state transition is added to its table **before** code performs it.
- [ ] Money operations preserve their required request key or durable entity/reference guard; document the actual route contract.
