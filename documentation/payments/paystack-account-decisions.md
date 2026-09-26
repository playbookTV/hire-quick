# Paystack account decisions — 21 September 2026

> **26 September pricing update:** fee incidence and cancellation allocation below describe the legacy model. New checkouts use the [client-paid platform fee and proportional refunds](client-paid-fee-policy-2026-09-26.md). Release timing and provider approval requirements remain applicable.

Tracks OVA-166 and the external acceptance gates for OVA-94/95/97/114/134/137. **Status: product settlement rules approved on 21 September 2026; account-specific provider approval and evidence still outstanding.** Public documentation and successful TEST API access do not approve HireQuick's merchant, escrow or held-wallet model.

## Closure work — 24 September 2026

**26 September legal/provider correction:** Paystack [explicitly lists escrow services as unsupported](https://support.paystack.com/en/articles/2127042). Manual Payouts is therefore not a presumed solution to the conditional-holding model. The support draft now requests eligibility assessment against that restriction. Nigerian legal review must separately classify custody/retained balances and recruitment licensing; provider support approval cannot replace statutory authorization. See the corrected [live-readiness plan](paystack-live-readiness-2026-09-26.md).

**26 September account decision:** the owner selected a separate HireQuick Paystack account. The Ovalay Academy integration below is historical TEST evidence only; its balance, recipients, credentials and account permissions must not be treated as HireQuick launch-account evidence. Provisioning and activation of the new account remain unverified. The [support draft](paystack-account-confirmation-request.md) now describes the separate account, client-paid 15% fee and proportional refunds. The [live-readiness plan](paystack-live-readiness-2026-09-26.md) separates account approval from the required provider-accounting work. No support message has been sent.

The [account-confirmation request](paystack-account-confirmation-request.md) is prepared but has not been sent. Existing written approval/support-case details and named business/account/finance owners have been requested from the owner; none has been supplied in this validation session. OVA-166 remains open pending that evidence.

A fresh read-only TEST preflight succeeded, with one active NGN TEST recipient and the earlier 10,000-kobo transfer still successful. The opening balance was 2,200,000 kobo; its change from the 21 September observation is unrelated account activity of unverified origin and must not be attributed to this test. The new hosted TEST checkout displays **Ovalay Academy**. Confirm that this is the intended integration and legal entity for HireQuick before a live rollout; a display name alone neither establishes nor disproves entity approval.

Public guidance was rechecked on 24 September: [Manual Payouts](https://support.paystack.com/en/articles/2131074) requires account enablement and identifies its dashboard evidence; [Paystack environments](https://paystack.com/docs/api/authentication/) explicitly says settlements are not processed in TEST mode. Therefore a successful TEST charge/balance movement cannot certify Nigerian live funding timing or held-wallet permission. [Transfer pricing](https://support.paystack.com/en/articles/2130370) also documents balance-debited fees, so a zero-fee TEST outcome cannot close account fee/reconciliation decisions.

See [24 September validation](certification-2026-09-24.md) for observed charge, refund, withdrawal and sweep outcomes. No live key, account-security change or provider-support communication is included.

## Verified evidence

A read-only `GET /balance` through the configured TEST-only Paystack MCP connection succeeded on 21 September 2026 and reported an NGN balance of 210,000 kobo. This initial read preceded the separately authorized single-transfer probe recorded in the validation report. This establishes TEST connectivity and an available balance at the observation time only. It does not establish the origin of funds, live enablement, fees or limits.

Paystack's current [Manual payouts guide](https://support.paystack.com/en/articles/2131074) describes Nigerian registered-business compliance, a partner Manual Payout Account and a support-enabled manual schedule. It identifies the dashboard's “Settled to Balance” setting as enablement evidence and describes Nigerian manual funding as next-working-day timing. The repository's immediate charge-to-available-balance assumption therefore needs account-specific validation. The guide does not establish HireQuick's permission to retain withdrawable usher balances.

The current [Transfers pricing](https://support.paystack.com/en/articles/2130370) and [NGN stamp-duty guidance](https://support.paystack.com/en/articles/7573314) describe provider charges beyond transfer principal. The current reconciliation formula tracks principal and application commission, not those external charges. Do not infer live fees from a zero-fee TEST result or silently reduce usher payouts to cover charges.

The [refund guide](https://paystack.com/docs/payments/refunds/) describes partial refunds and asynchronous outcomes; it does not establish that HireQuick recovers the original processing fee. The active shared policy keeps `DEDUCT_PROCESSING_FEE_ON_REFUND = false`. The owner has now approved no processing-fee deduction from client refunds. That product decision does not establish provider fee recovery or account-contract approval; see the [approved settlement policy](approved-settlement-policy-2026-09-21.md).

## Decision register

Owner roles below are proposed responsibilities; named accountable owners have not been confirmed.

| Decision | Required evidence / implementation consequence | Accountable role | Status |
| --- | --- | --- | --- |
| Merchant/funding model | Written Paystack acceptance of the attendance-conditioned hold model, merchant responsibility and permitted entity/account configuration | Business owner + compliance | Awaiting approval |
| Manual payouts enablement | Compliance approval, partner account provision, redacted schedule screenshot and Paystack confirmation for this account | Business owner | Unverified |
| Held usher balances | Explicit permission for released earnings to remain withdrawable in HireQuick's balance; otherwise redesign settlement | Business owner + compliance | Unverified |
| Time and balance limits | Written current account limits, how limits are measured, automatic settlement behavior and monitoring thresholds; re-confirm the TRD's 90-day assumption | Finance + Paystack account owner | Unverified |
| Recipient verification | Account-name resolution requirements, identity/BVN requirements and allowed beneficiary ownership | Compliance + backend owner | Account resolution exists; account rules unverified |
| Transfer charges/limits | Account-specific minimum, maximum, daily aggregate, fees/levies, funding and reversal treatment, backed by redacted transaction evidence | Finance | Unverified |
| Commission extraction | Approval to transfer platform commission to the operating recipient; observed fee and reversed-transfer treatment | Finance | Local idempotency exists; provider evidence pending |
| Refund processing fees | Who bears original charges, whether any fees are returned, partial-refund treatment and asynchronous terminal evidence | Finance + product owner | Owner approved no client refund fee deduction on 21 September 2026; provider charges/evidence remain open |
| Balance reconciliation | Opening balance, top-ups, delayed settlement, fees and reversal accounting; approved append-only entries and revised formula where needed | Finance + backend owner | Current formula is not full account certification |
| Late cancellation | Whether 50%/100% usher compensation includes platform commission, provider fee responsibility, and required approvals | Product + Finance | Owner approved 15% commission within the usher allocation and no client refund fee deduction on 21 September 2026; local implementation is recorded in the settlement implementation report |

Do not mark provider/account decisions approved without the approver, date, account/environment, provider reference and redacted evidence location. Product approvals above are recorded separately from provider evidence. Store only non-sensitive summaries in Linear. No provider-support message has been sent.

## Approved product decisions (OVA-136 / OVA-137)

On 21 September 2026 the project owner approved the proposed policies and instructed “approved prposed. set and document”. The [approved settlement policy](approved-settlement-policy-2026-09-21.md) records the decision, exact boundaries, integer-kobo allocation and implementation acceptance criteria.

- **OVA-136:** completion leaves funds in escrow until event end + 72 hours. Release to the wallet requires the deadline to have elapsed and no unresolved dispute. Automatic completion does not release funds early.
- **OVA-137:** client refunds are 100% more than 48 hours before start, 50% from 12 through 48 hours inclusive, and 0% below 12 hours. The remaining usher allocation includes the 15% platform commission. No processing fee is deducted from the client refund.

These product decisions are approved, so neither ticket is waiting for another product choice. Local runtime implementation is recorded in the [settlement implementation report](settlement-implementation-2026-09-21.md); deployment and provider certification remain separate. Written Paystack authorization and account-specific fee/limit evidence remain separate OVA-166 launch gates.

## Provider certification (OVA-114)

The maintained local lifecycle runs through both `InMemoryPaystack` and the HTTP adapter over loopback. It tests local behavior, not the actual account. Actual certification still needs a funded TEST checkout, charge verification/HOLD, release, withdrawal, refund and commission sweep; signed/delayed/duplicate/out-of-order callbacks; response loss; pending/unknown/reversal cases; insufficient provider funds; and observed recipient, fee and limit behavior.

The prepared `scripts/validation/test-provider-withdrawal.ts` is bounded to one 10,000-kobo (₦100) TEST transfer to an explicitly selected existing TEST recipient, then GET-only polling and same-key replay. It uses a synthetic wallet fixture, so even a pass would not complete funded charge-to-payout certification. The user explicitly authorized this single TEST transfer on 21 September 2026 to the existing TEST recipient ending 7716. Read-only lookup confirmed that recipient is active, NGN and TEST-domain, and the local key matches the configured TEST-only MCP key. The probe made one POST and first remained OTP-pending; replay preserved one debit and no second POST. The owner then supplied the OTP, and finalizing that existing transfer produced independently verified provider success with a 10,000-kobo balance decrease. The account therefore requires an explicit transfer-approval step. See the [validation report](todo-validation-2026-09-21.md) for sanitized evidence. Do not disable that protection implicitly for unattended withdrawals. The earlier automatic-review rejection is superseded for this one approved transfer only.

Archive sanitized references, amounts/currency, terminal states, webhook order, ledger sums, balance delta and unexplained charges. Pending results remain incomplete. TEST certification does not approve the live merchant model.
