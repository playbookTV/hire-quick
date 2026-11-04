# Weekly usher payouts and a configurable platform fee — proposal, 23 October 2026

**Status: proposal. The seven open questions in §9 were answered on 23 October; see the [decisions record](weekly-payouts-decisions-2026-10-23.md).** It responds to the client's request that clients pay HireQuick, HireQuick keeps a configurable percentage, and ushers are paid on a fixed weekday — first by an operator, later automatically.

Reviewed against the source at commit `6d6c2ea`. The current behavior it builds on is described in [Payments, escrow and the ledger](../../docs/PAYMENTS.md).

## 1. Summary

Most of the requested model already exists. Clients already pay into HireQuick's Paystack balance. The ledger already splits each booking into usher pay and the HireQuick fee. Released usher pay already accumulates in an internal wallet.

Three things change:

1. **Who triggers the payout.** Today an usher withdraws whenever they like. In the new model HireQuick sends one payout per usher per week, as a **payout run** that an operator approves (phase 1) or the worker executes (phase 2).
2. **The fee rate becomes a setting.** Today it is the constant `PLATFORM_FEE_BPS = 1500` (15%). It becomes an admin-controlled value that each order records when it is created.
3. **The admin console shows what HireQuick holds and owes.** It shows HireQuick's accumulated fees, the amount owed to ushers and the next run.

Nothing changes in the ledger's rules. A weekly payout is a withdrawal that the system starts instead of the usher. It uses the same wallet debit, Paystack transfer, webhook settlement and failure reversal. No new ledger entry type is needed, so the [reconciliation formula](../../docs/PAYMENTS.md#reconciliation) is unchanged as long as payouts leave from the Paystack balance (option A in §4.4).

## 2. Money flow

```
Client pays ₦50,000 ──▶ HireQuick Paystack balance
                         │  HOLD (per booking)
                         ▼
               event happens, attendance verified
                         │  event end + 72 h, no open dispute (unchanged)
                         ▼
          RELEASE ₦40,000 ──▶ usher wallet (owed to usher)
          FEE     ₦10,000 ──▶ HireQuick revenue (still in the balance)
                         │
     ┌───────────────────┴───────────────────────┐
     ▼ weekly payout run (Thursday)               ▼ commission sweep (optional)
 one transfer per usher = wallet balance     HireQuick revenue ──▶ HireQuick bank
```

At any moment the Paystack balance should equal **held for upcoming events + owed to ushers + unswept HireQuick revenue**. The daily reconciliation job already checks this. The admin console should show these three figures as HireQuick's "wallet".

## 3. The platform cut

### 3.1 Two ways to describe the same split

The client's example ("client pays ₦50,000, our cut is ₦5,000 or ₦10,000") can be read two ways. They produce the same money but name different percentages:

| How the rate is stated | Client pays | HireQuick keeps | Usher receives |
| --- | --- | --- | --- |
| **Added on top** of staff pay (current model, 25%) | ₦50,000 | ₦10,000 | ₦40,000 |
| **Taken out** of the client payment (20%) | ₦50,000 | ₦10,000 | ₦40,000 |

A 25% markup on staff pay is a 20% share of what the client pays. A 15% markup (today) is about 13% of the client payment.

**Recommendation:** keep the current "added on top" model, approved on 26 September in the [client-paid fee policy](client-paid-fee-policy-2026-09-26.md). Ushers see and receive their full advertised pay, and the code already works this way. Make the markup configurable. The admin screen can also show the equivalent share of the client payment so nobody confuses the two numbers. If the client really wants "taken out" pricing, the legacy `splitFee` path still exists, but returning to it is a policy change, not a setting.

### 3.2 A rate change must not reprice existing orders

Today the rate is re-derived from the constant in several places, so changing it would break orders already in flight:

- `bookingAllocation()` (`packages/shared/src/money.ts`) recomputes the fee from `PLATFORM_FEE_BPS` and throws if the order's stored gross does not match. `holdOrder` calls it when the client's payment arrives (`ledger.ts`, preflight and hold), and `cancellationSettlement()` (`packages/shared/src/policy.ts`) calls it for cancellations.
- **Installed mobile apps reject any order whose amount is not staff pay × 1.15** (`apps/mobile/lib/order-checkout.ts`, `validateOrderRoster`). If the server rate changed first, every client on a current build would see "We couldn't confirm every person and amount in this order" and could not pay. The mobile app does not use over-the-air updates, so the fix ships through a new EAS/store build.
- The create-event, edit-event, event-details and payment-summary screens compute and label the fee with the constant.

Design:

- Add `feeBps Int?` to `Order` and `Booking`. It is set from the active rate when the client confirms the batch, and `null` means "legacy 1500". `Payment.platformFee`/`usherPayout` are already per-booking snapshots and stay authoritative after HOLD.
- `priceBooking(staffPay, feeBps)` and `bookingAllocation(gross, staffPay, feeBps)` take the snapshot. Every caller passes the booking's `feeBps`, never the current setting.
- Add a `PricingSetting` history table (`feeBps`, `effectiveFrom`, `makerId`, `checkerId`). It is append-only like the ledger. A change needs two admins (reuse `Approval` with a new `PRICING_CHANGE` kind) and is written to the audit log. Validate it as an integer in a sensible range, for example 0–5000 bps.
- `GET /api/config/pricing` returns the active rate. Mobile quotes and labels use it, and `validateOrderRoster` checks each booking against its own `feeBps`.
- **Rollout order:** ship the API and mobile builds that read the rate first, wait until old builds are gone or blocked by a minimum-version check, then change the rate.
- Per-client or per-event rates (for example a negotiated corporate rate) fit the same snapshot later. They are not needed for the first version.

## 4. Phase 1 — weekly payout run, operator approved

### 4.1 Payday and cutoff

The 72-hour dispute hold (OVA-136, approved 21 September) still applies: usher pay reaches the wallet 72 hours after the event ends. The payout run then pays whatever is in each wallet when the run is built. **The cutoff is the moment the run is built**, not midnight, so nothing released before the run is missed.

Most Lagos events are on weekends, so the weekday matters:

| Event ends | Released to wallet | Wednesday 09:00 run | Thursday 09:00 run |
| --- | --- | --- | --- |
| Sat 24 Oct, 22:00 | Tue 27 Oct, 22:00 | Wed 28 Oct (4 days) | Thu 29 Oct (5 days) |
| Sun 25 Oct, 21:00 | Wed 28 Oct, 21:00 | **Wed 4 Nov (10 days)** | Thu 29 Oct (4 days) |
| Thu 29 Oct, 22:00 | Sun 1 Nov, 22:00 | Wed 4 Nov (6 days) | Thu 5 Nov (7 days) |

**Recommendation: Thursday at 09:00 Lagos time.** It pays every weekend event in the very next run. Store the weekday and time as settings, not code.

### 4.2 What a run pays

- One line per usher whose wallet balance is at or above a minimum (for example ₦1,000; smaller balances carry over). Weekly batching also means HireQuick pays at most one Paystack transfer fee per usher per week. Under the approved policy those fees are a HireQuick cost, not a deduction from usher pay.
- The amount is the usher's whole wallet balance when the run is built. Disputed bookings never reach the wallet, so the wallet holds only payable money.
- **Excluded and carried forward:** ushers with no verified payout bank account, suspended or erased accounts, and ushers whose payout account changed recently (see §5.2). The preview shows each exclusion with its reason, and the usher is told what to fix.
- Ushers can have several bank accounts today. Add a **payout account** choice (`BankAccount.isPayoutDefault`, one per usher). The run uses that account.

### 4.3 Run lifecycle

```
DRAFT ──(maker submits)──▶ AWAITING_APPROVAL ──(second admin approves)──▶ APPROVED
                                     │ reject                                │
                                     ▼                                       ▼
                                 CANCELLED                    PROCESSING (one withdrawal per line)
                                                                             │
                                             COMPLETED  or  COMPLETED_WITH_FAILURES
```

1. **Preview.** The admin opens Payouts and sees the proposed lines: usher, payout account (masked), amount, number of bookings, exclusions and the total.
2. **Submit and approve.** One admin submits and a different admin approves. This reuses the maker-checker `Approval` model with a new `PAYOUT_RUN` kind. The approval records a hash of the exact lines, so the approver approves what they saw.
3. **Execute.** For each line, inside the existing idempotent path: `requestWithdrawal` (wallet DEBIT, withdrawal `PROCESSING`), then a `WITHDRAWAL_TRANSFER` payment operation with reference `wd_<withdrawalId>`, then `driveTransfer`. This is the same code that runs today when an usher withdraws, so verify-before-send, reference reuse, webhook settlement and `resumeOps` recovery all apply unchanged.
4. **Settle.** `transfer.success` marks the withdrawal `PAID`. `transfer.failed`/`reversed` appends a wallet REVERSAL, so the money is back in the wallet and the next run picks it up. The run shows per-line status and allows a retry.

Data model sketch:

```prisma
enum PayoutRunStatus { DRAFT AWAITING_APPROVAL APPROVED PROCESSING COMPLETED COMPLETED_WITH_FAILURES CANCELLED }
enum WithdrawalSource { USHER_REQUEST PAYOUT_RUN }

model PayoutRun {
  id          String          @id @default(uuid()) @db.Uuid
  periodKey   String          @unique   // e.g. "2026-W44"; one scheduled run per week
  builtAt     DateTime        @db.Timestamptz(6) // the cutoff
  status      PayoutRunStatus @default(DRAFT)
  linesHash   String          // what the checker approved
  approvalId  String?         @unique @db.Uuid
  withdrawals Withdrawal[]
  createdAt   DateTime        @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime        @updatedAt @db.Timestamptz(6)
}

// Withdrawal gains: payoutRunId String? @db.Uuid, source WithdrawalSource @default(USHER_REQUEST)
// BankAccount gains: isPayoutDefault Boolean @default(false) (partial unique index per usher, in migration SQL)
```

Totals are computed, not stored. A week's total across all ushers can exceed the Postgres `Int` limit of ₦21,474,836.47 (see [ledger amount limits](../ledger-limits.md)), but each individual line cannot.

Usher-requested withdrawals are switched off by a setting (`PAYOUT_MODE=weekly`). The endpoint returns a clear `409 PAYOUTS_SCHEDULED` ("Payouts are sent every Thursday"), so builds that still show the Withdraw button get a readable message. If an early-withdrawal option is wanted later, the endpoint and the ledger already support it.

### 4.4 Where the money sits until payday

This decides whether payouts can be automated at all.

**Option A — keep it in the Paystack balance (recommended).** Charges stay in the Paystack balance ("Settled to Balance", Paystack Manual Payouts) and runs pay out by Paystack transfer. Everything above works unchanged, phase 2 is possible and the existing reconciliation stays meaningful. Requirements:

- The Paystack account's payout schedule must read "Settled to Balance". This is still unverified for the live account ([decision register](paystack-account-decisions.md), "Manual payouts enablement"). If Paystack instead settles to the bank automatically, today's withdrawals and the daily reconciliation are already affected, so check it whatever is decided here.
- Paystack still has to accept the merchant model (OVA-166). Paystack lists escrow services as unsupported. HireQuick charging as the merchant and paying its staff weekly is closer to an ordinary marketplace payroll than the earlier "funds held until attendance" framing, so the pending support request should describe this model. That is a question for Paystack and counsel, not a conclusion of this note.

**Option B — Paystack settles to HireQuick's bank and ops pays ushers from the bank.** The system builds the same run and exports a payout sheet (usher, bank, account number, amount, reference). Ops pays it through the bank's bulk-payment tool and marks each line paid with the bank reference. Phase 2 automation is not possible this way. The reconciliation formula would also become wrong: it subtracts paid withdrawals from the expected Paystack balance, but these payouts never touch Paystack, and settlements drain that balance anyway. Option B therefore needs reconciliation rebuilt around imported settlements, as in §2 of the [live-readiness plan](paystack-live-readiness-2026-09-26.md). Treat it as a fallback if Paystack will not settle to balance.

Under either option, keep a **"mark paid externally"** action for exceptions, for example a line paid by hand after a bank problem. It records the reference, needs two admins and does not call Paystack. Under option A it must be accounted for separately in reconciliation, because that money left HireQuick's bank, not the Paystack balance.

### 4.5 Paystack transfer OTP

The 21 September TEST evidence showed that the account requires an **OTP for every transfer** ([validation report](todo-validation-2026-09-21.md)). With OTP on, each API transfer stops at `otp` until someone enters the code. That is workable for a handful of ushers and not for fifty. Phase 1 can therefore:

- keep OTP on and let the approving admin enter the OTP from the payout screen (needs a `finalizeTransfer` method on `PaystackPort`; slow but safe), or
- turn OTP off and use the transfer approval URL (§5.3) as the replacement control. This is the end state for phase 2 anyway.

Turning OTP off is an account-security decision for the owner. Make it explicitly and record it, never as a side effect of deployment.

## 5. Phase 2 — automated disbursement

### 5.1 The weekly job

Add `payoutRun` to the worker schedule (`jobs/runtime.ts`), for example cron `0 8 * * 4` (Thursday 08:00 UTC = 09:00 Lagos). It runs after the daily `reconcile` job (03:17 UTC), so a fresh reconciliation result is available. The job:

1. builds the week's run, idempotent on `periodKey`, so a retry or a second worker cannot create two runs;
2. runs the automatic-approval checks (§5.2);
3. if every check passes, approves the run as the system and executes it exactly as in §4.3; otherwise it leaves the run `AWAITING_APPROVAL` and alerts the admins, so phase 1 becomes the fallback;
4. reports a Better Stack heartbeat and a summary to the admin feed. Ushers receive a "payout sent" notification (new `PAYOUT_SENT`/`PAYOUT_FAILED` notification types).

A kill switch (`PAYOUTS_AUTO_EXECUTE=false`) keeps the job building runs without executing them. That is the phase 1 behavior and the safe default.

### 5.2 Automatic-approval checks

Execute without a human only when all of these hold:

- the latest reconciliation is clean (no drift, no stale held bookings) and less than 24 hours old;
- `PaystackPort.getBalanceKobo()` covers the run total plus a margin for transfer fees;
- the run total and each line are under configured caps (for example ₦2,000,000 per run and ₦200,000 per line to start, raised as confidence grows);
- no line pays to a bank account added or changed in the last 7 days, and no line is an usher's first-ever payout. A changed payout account is the usual account-takeover target. Those lines go to manual approval and the rest of the run proceeds;
- no payment operation is quarantined and no previous run is still `PROCESSING`.

### 5.3 Paystack transfer approval URL

With OTP off, anyone holding the secret key could send transfers. Paystack's [transfer approval](https://paystack.com/docs/transfers/how-transfers-work/) feature closes that gap. Paystack calls a URL HireQuick controls before each transfer. A 200 response approves it, a 400 response rejects it, and no reply within a few seconds blocks it. Add `POST /webhooks/paystack/transfer-approval`, which approves only when:

- the reference matches `wd_<id>` for a `PROCESSING` withdrawal from an approved run (or an approved usher withdrawal), or `sweep_<period>` for a pending commission sweep; and
- the amount and recipient code match the stored operation exactly.

It is a single indexed lookup, so it answers well inside Paystack's deadline. Before relying on it, confirm how Paystack authenticates these calls (whether they carry the same HMAC signature as webhooks) and register the URL under Settings → Preferences in the **Live** dashboard.

### 5.4 Single transfers, not the bulk endpoint, to start

Paystack's [bulk transfer endpoint](https://paystack.com/docs/transfers/bulk-transfers/) accepts up to 100 transfers per request, paced about 5 seconds apart, and sends one webhook per transfer. It also requires OTP to be off. The existing single-transfer runner already has per-reference verification, retry and recovery, and it is fast enough for a few hundred ushers a week, so start there. Move to bulk requests only when run size makes it worthwhile. That changes the dispatch step only, not the ledger.

## 6. Why not Paystack Split Payments

Paystack splits and subaccounts divide a charge **at the moment the client pays** and settle each share on Paystack's schedule. That cannot wait for attendance, hold through the dispute window, or absorb no-shows and cancellations. Every usher would also need a Paystack subaccount. The split the client wants already happens inside HireQuick's ledger (RELEASE to the usher, FEE to HireQuick). The weekly run is the scheduled transfer of the usher's share.

## 7. Changes by area

| Area | Change |
| --- | --- |
| `@hq/shared` | `priceBooking`/`bookingAllocation`/`cancellationSettlement` take `feeBps`; payout-run schemas; next-payout date helper (Lagos time) |
| Database | `Order.feeBps`, `Booking.feeBps`, `PricingSetting`, `PayoutRun`, `Withdrawal.payoutRunId`/`source`, `BankAccount.isPayoutDefault`; new `ApprovalKind` values `PAYOUT_RUN`, `PRICING_CHANGE`; new notification types. One tracked migration, with the partial unique index in SQL |
| Ledger | No new entry types. Callers pass booking snapshots. `requestWithdrawal` is reused for run lines |
| API | Pricing read/change endpoints; admin payout-run preview/submit/approve/execute/retry/mark-paid-externally; transfer approval webhook; `PAYOUT_MODE` gate on usher withdrawals; `finalizeTransfer` on `PaystackPort` if OTP stays on |
| Worker | `payoutRun` job with checks, kill switch and heartbeat; optionally move the commission sweep to after the run |
| Admin | Payouts page (preview, approvals, per-line status, CSV export); pricing settings; HireQuick wallet summary (held / owed to ushers / revenue) |
| Mobile | Wallet shows "Next payout Thursday 29 Oct · ₦X" and payout history; payout-account selection replaces Withdraw; fee labels and roster check read the server rate. Requires a new EAS build |
| Docs | `docs/PAYMENTS.md` §4 and §12, `docs/API.md`, `docs/OPERATIONS.md` (weekly run runbook), `docs/STATUS.md` |

## 8. Prerequisites before any real payout

These come from the [23 October production switch](../deployment-production-mode-2026-10-23.md) and apply to the current design as much as to this one:

1. **The production database still holds TEST-mode ledger entries and wallet balances.** A payout run would try to pay those balances with live money. Clear them with compensating ledger entries first. This blocks any run, manual or automatic.
2. **Saved usher bank accounts carry TEST-mode recipient codes.** Ushers must re-add their accounts, or recipients must be recreated against the live key, before the first run.
3. Set the live webhook URL in Paystack's Live settings and confirm one signed live delivery.
4. Confirm the live account's payout schedule (§4.4) and transfer OTP setting (§4.5).

## 9. Decisions needed from the client

1. **Fee wording:** is the configured percentage a markup on staff pay (recommended, current) or a share of the client payment? (§3.1)
2. **Payday:** Thursday 09:00 Lagos (recommended) or Wednesday? (§4.1)
3. **Dispute hold:** keep the approved 72 hours before pay reaches the wallet? (§4.1)
4. **Where funds sit:** Paystack balance (recommended, enables automation) or HireQuick's bank with manual bank payouts? (§4.4)
5. **Transfer OTP:** keep it on during phase 1, or turn it off with the transfer approval URL? (§4.5, §5.3)
6. **Minimum payout and automatic caps:** starting values for the minimum line, per-line cap and per-run cap. (§4.2, §5.2)
7. **Early withdrawal:** should ushers ever be able to cash out before payday? (§4.3)

## 10. Suggested delivery order

1. Prerequisites in §8.
2. Configurable fee: snapshot columns and server-side pricing, then the mobile build that reads the rate, then the admin setting. Change the rate only after old builds are retired.
3. Phase 1 payout run with operator approval, payout-account selection, usher wallet copy and notifications. Turn off usher withdrawals when the first run goes live.
4. Phase 2 automation behind the kill switch: the transfer approval URL first, then OTP off, then caps raised as clean runs accumulate.
