# Approved settlement policy — 21 September 2026

> **26 September pricing update:** fee incidence and cancellation allocation below describe the legacy model. New checkouts use the [client-paid platform fee and proportional refunds](client-paid-fee-policy-2026-09-26.md). Release timing and provider approval requirements remain applicable.

**Decision: approved. Implementation: OVA-136/137 complete; final regressions passed and API/worker/admin deployed to TEST/staging on 22 September. Updated native binaries remain separate.**

The project owner approved both proposed options in the Codex conversation on 21 September 2026: “approved prposed. set and document”. This records product authorization for HireQuick. It does not record Paystack approval, a provider contract amendment, deployment or completed runtime validation. It supersedes the unresolved product-policy choices in the earlier account decision register and PRD/TRD/UXRD drafts.

## Completion and the dispute window — OVA-136

- Verified or automatic completion records `COMPLETED`; the payment remains in escrow and is not withdrawable.
- Automatic completion remains at event end plus the existing grace period (default 60 minutes). It does not shorten the dispute window.
- The dispute deadline is the scheduled event end in Africa/Lagos plus 72 elapsed hours. Disputes may open before the deadline; release becomes eligible at the deadline. The exact instant belongs to release eligibility, so the two time ranges do not overlap.
- An eligible completed booking releases to the usher wallet only if no unresolved dispute exists. A worker may settle after the deadline; the deadline is an earliest release time, not a promise of an instantaneous bank transfer.
- A dispute freezes the held allocation. An admin decision in the usher's favour before the deadline restores the completed, held state; it does not allow early withdrawal. After the deadline, resolution may release the funds under existing approval controls. A client-favour decision uses the refund path.
- `PAID` means the wallet credit has actually been recorded. Bank withdrawal remains a separate action. Completion messages must not claim that funds are available.
- Already released or withdrawn historical funds are not clawed back or made negative by this decision. Identify affected legacy bookings before rollout; do not pretend their funds remain held or enable a second payout/refund. Such cases require manual review.

Implementation acceptance: use one shared deadline rule; enforce time, state and dispute checks under the ledger's lifecycle lock; separate completion from release in API, jobs, admin resolution and mobile copy; preserve append-only entries and idempotency. Test just before, exactly at and after the deadline, competing dispute/release requests, worker retries, early admin resolution, historical released funds and money conservation.

## Client cancellation — OVA-137

These rules apply when the client cancels a confirmed booking. Usher cancellation and no-show retain their existing full-client-refund policy.

| Time before scheduled event start | Client refund | Gross usher allocation |
| --- | --- | --- |
| More than 48 hours | 100% | 0% |
| 12 through 48 hours, including both boundaries | 50% | 50% |
| Less than 12 hours | 0% | 100% |

The normal **15% platform commission is deducted from the gross usher allocation**. It is not added to the client's payment or deducted from the refund. **No processing fee is deducted from the client's refund.** Any unrecovered provider refund/processing charge is borne by HireQuick; its actual amount and reconciliation treatment still need provider evidence under OVA-166. This does not approve unspecified withdrawal charges or limits.

All arithmetic uses integer kobo. For gross booking amount `G` and refund percentage `R`:

```text
refund = floor(G × R / 100)
usher allocation = G − refund
platform fee = floor(usher allocation × 15 / 100)
usher wallet payout = usher allocation − platform fee
refund + usher wallet payout + platform fee = G
```

For an odd-kobo booking of 10,001 kobo in the 12–48-hour window, refund = 5,000, gross usher allocation = 5,001, platform fee = 750 and net usher payout = 4,251 kobo. No kobo is lost or created.

Implementation acceptance: persist the cancellation time and quoted settlement with the first accepted intent so retries and delayed approval do not reclassify its window; obtain confirmation of the displayed financial consequence; retain existing audit and maker-checker controls; reserve the allocation before provider dispatch; append the refund, net payout and fee exactly once after confirmed settlement. A zero-refund cancellation must not send a zero-value provider refund. Pending or uncertain provider results must not be labelled settled. Test boundary times, odd kobo, repeated requests, delayed approvals, provider uncertainty and refund/payout/fee conservation.

## Scope and rollout

The approved rules are now implemented in the local shared policy, ledger, API, worker, admin and mobile sources. See the [implementation and validation record](settlement-implementation-2026-09-21.md). The [22 September release](../deployment-2026-09-22.md) records verified server/admin deployment; this decision record alone does not certify provider behavior.

OVA-166 remains open for account-specific Paystack permission to hold client/usher funds, manual payouts, fees, limits and reconciliation evidence. That external gate does not prevent implementing and locally testing the approved product rules. See the [account decision register](paystack-account-decisions.md) and [validation report](todo-validation-2026-09-21.md).
