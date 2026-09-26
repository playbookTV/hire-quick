# Client-paid platform fee — 26 September 2026

The owner directed that ushers receive their full agreed pay and clients pay the 15% platform fee on top. After considering a full fee refund, the owner corrected the cancellation decision to **proportional refunds**. This document supersedes the fee incidence and cancellation allocation in the 21 September policy for new checkouts. Completion, dispute deadlines, approval thresholds and provider recovery rules remain unchanged.

## Price and cancellation examples

For ₦10,000 agreed staff pay, the client pays ₦11,500: ₦10,000 staff pay plus ₦1,500 platform fee.

| Outcome | Client refund | Usher wallet credit | Platform fee retained |
| --- | ---: | ---: | ---: |
| Completed, eligible for release | ₦0 | ₦10,000 | ₦1,500 |
| Client cancels more than 48h before start | ₦11,500 | ₦0 | ₦0 |
| Client cancels 12–48h before start, inclusive | ₦5,750 | ₦5,000 | ₦750 |
| Client cancels less than 12h before start | ₦0 | ₦10,000 | ₦1,500 |
| Usher cancels or does not attend | ₦11,500 | ₦0 | ₦0 |

The platform fee is never deducted from the usher's pay or compensation. No provider processing charge is deducted from client refunds. Paystack charges are separate platform operating costs; this change does not introduce additional client or usher charges.

## Integer-kobo rules

For agreed staff pay `S`, platform fee `F`, client gross `G`, and the existing refund percentage `R`:

```text
F = floor(S × 1500 / 10000)
G = S + F
staff_refund = floor(S × R / 100)
fee_refund = floor(F × R / 100)
client_refund = staff_refund + fee_refund
usher_compensation = S − staff_refund
platform_retained = F − fee_refund
client_refund + usher_compensation + platform_retained = G
```

Refund each component independently and give its exact remainder to its original recipient. An odd-kobo 50% refund can therefore differ by one kobo from flooring half the combined gross; always display the calculated amount before confirmation. For 10,007 kobo staff pay, the fee is 1,501, total is 11,508, refund is 5,003 + 750 = 5,753, usher compensation is 5,004 and retained fee is 751.

Round the fee per booking before summing a batch, so partial refunds and ledger allocations conserve the exact Paystack charge. The signed 32-bit database limit applies to the client total including fees.

## Persistence and rollout

- New checkouts snapshot agreed pay in nullable `Booking.staffPay`. `Booking.amount`, `Payment.grossAmount` and the order total include the platform fee. The event budget remains staff pay per head.
- Null `staffPay` identifies existing orders, including pending checkouts. Their recorded prices and prior fee-deducted allocations remain unchanged. No historical ledger entries are rewritten, no customer is silently charged more, and no unfunded increase is credited to a wallet.
- New cancellation reservations use `CLIENT_CANCEL_V2` and persist the staff-pay snapshot. Existing V1 receipts keep their original arithmetic. Finalization checks that the snapshot matches the held booking, as well as its gross and approval state.
- Apply `20260926130000_client_paid_platform_fee` before deploying the API/worker. Release the updated mobile pricing screens with the backend: old mobile binaries show the former fee treatment and must not be allowed to present misleading new-checkout totals. A supported-client rollout/update gate remains a release concern.
- This is a local implementation record, not a production deployment or a change to the Paystack account.

## Payment and Paystack examination

1. `confirmBatch` snapshots prices and creates one order for the selected staff. The durable checkout initializes one Paystack charge for the complete order total.
2. Provider charge verification and signed webhook handling establish payment; opening or returning from checkout does not itself release funds. The ledger holds each booking's full client allocation.
3. Completion leaves funds held until event end in Lagos plus 72 hours. Unresolved disputes block release. Eligible release credits the full agreed staff pay to the usher wallet and records the platform fee separately.
4. Wallet release is internal accounting. A withdrawal initiates the Paystack bank transfer; recovery verifies terminal provider outcomes. The platform's fee is withdrawn separately through the commission sweep.
5. Cancellation reserves an immutable quote. Partial refunds refer to the original batch charge. Settlement appends the confirmed refund, compensation and retained fee once.

The repository has both `InMemoryPaystack` and `HttpPaystack`; older project text describing HTTP support as a future phase is outdated. Current Paystack documentation describes server-side [payment verification](https://paystack.com/docs/payments/verify-payments/), asynchronous [refunds](https://paystack.com/docs/payments/refunds/) and [transfer outcomes](https://paystack.com/docs/transfers/single-transfers/).

Two existing launch issues remain separate from fee incidence:

- The account decision register still lacks written account-specific permission for the held-funds/withdrawable-wallet model and verified manual-payout configuration. Paystack's [manual payouts guidance](https://support.paystack.com/en/articles/2131074) requires account enablement; TEST success does not establish live permission.
- Reconciliation tracks principal and internal fee allocations but not a complete account statement including provider charges, external funding and settlement timing. Paystack [checks principal plus transfer fees against balance](https://paystack.com/docs/transfers/how-transfers-work/). Preserve staff pay and account for provider charges separately rather than reducing payouts to hide drift.

See the [account decision register](paystack-account-decisions.md) for existing evidence and open questions. No live payment or provider configuration change was made for this implementation.

## Validation — 26 September 2026

- Shared package: 74 tests passed, including client-paid pricing, component rounding, cancellation boundaries, legacy allocation preservation and aggregate overflow after adding the fee.
- API unit checks: 10 passed across cancellation snapshots, recorded-receipt replay and booking read models.
- Mobile saved-checkout checks: 11 passed, including exact saved staff-pay/fee allocations and rejection of inconsistent prices.
- Database regression run: 40 of 43 tests passed initially; three existing settlement tests timed out. All three passed unchanged on a fresh isolated rerun. Two affected recruitment/refund tests also passed. **45 distinct selected database tests passed across these runs.** Covered checkout recovery/expiry, confirmed totals, concurrent event edits, completion/dispute release, legacy ledger behavior, withdrawals, proportional cancellations and duplicate protection.
- Tracked migrations applied successfully to disposable schemas; Prisma migration diff reported no schema drift. The maintained runner verified raw-SQL isolation across eight connections. Both maintained-runner schemas were removed and cleanup verified. An earlier ad hoc run was stopped and its temporary schema removed before switching to the maintained runner.
- Workspace typecheck and test-source typecheck passed. Workspace lint and test lint passed; three pre-existing warnings remain in the API environment regex and mobile SmileID/Sentry plugin.
- Documentation link checks and `git diff --check` passed.

Database tests used simulated Paystack providers. No live payment, deployment or merchant account reconfiguration was performed. Native screens were typechecked and their saved-order calculations tested; a device-level visual walkthrough was not performed in this change.
