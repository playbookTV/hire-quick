# Paystack account confirmation request — OVA-166

Prepared 24 September 2026. **Draft only; not sent.** Send through the account owner's authenticated Paystack support channel, attaching the legal entity and integration identifier privately. Never attach API keys, customer data or identity documents to this repository or Linear.

## Message

Subject: HireQuick Nigeria — confirmation of marketplace held funds, manual payouts and transfer terms

Hello Paystack Support,

We are preparing HireQuick, a Nigerian event-staffing marketplace, for launch and need written confirmation of the permitted setup for our registered-business account.

Clients pay for event staff through Paystack-hosted checkout. We allocate each payment across the booked staff. Funds remain held until verified attendance and the end of a 72-hour dispute period following the event. Unresolved disputes keep the affected allocation on hold. On release, 85% becomes the usher's withdrawable earnings and 15% is HireQuick's commission. Ushers request bank withdrawals; HireQuick periodically transfers earned commission to its operating account.

Client cancellation refunds are 100% more than 48 hours before the event, 50% from 12 through 48 hours inclusive, and 0% below 12 hours. Any remaining usher allocation includes our 15% commission. We do not deduct processing fees from the promised client refund; HireQuick bears unrecovered processing/refund charges.

Please confirm the following specifically for our account, including effective dates and any conditions:

1. Is this attendance/dispute-conditioned holding model permitted, and what merchant, safeguarding or licensing obligations apply to HireQuick? May released usher earnings remain withdrawable in our balance, or must they be transferred immediately?
2. Is our entity approved for Manual Payouts and the required Nigerian partner account? Please confirm activation evidence, settlement-to-balance timing, maximum holding periods, balance ceilings, inactivity/automatic-settlement rules, and whether the previously documented 90-day assumption applies.
3. What beneficiary identity, account-name matching and verification requirements apply to individual ushers? Please confirm transfer minimums, per-transfer and daily limits, and any limits specific to our account.
4. Please confirm collection, refund, transfer, stamp-duty/levy and reversal charges; where each is debited; and whether original collection fees are returned on full or partial refunds. May platform commission be transferred to our own operating account?
5. Our TEST account required OTP approval for a transfer. What approved operating process should we use for customer withdrawals and scheduled commission transfers? We have not disabled OTP protection.
6. How should we distinguish collected-but-unsettled money from available transfer balance, opening balances, top-ups and provider charges in reconciliation? Which authoritative reports or API records expose these movements?
7. Which pending, reversed, failed, insufficient-balance, refund and webhook-delivery scenarios can be reliably reproduced in TEST mode? Please identify anything that requires a separately approved controlled live acceptance check.

If our current model is unsupported, please recommend the permitted settlement model and configuration before we enable real customer payments.

Thank you,
HireQuick team

## Evidence required to close OVA-166

Record the named business/account and finance owners; legal entity and account/environment; Paystack case/reference; written answers and approver; date; redacted activation evidence; approved limits/fee schedule; and links to resulting engineering changes and acceptance tests. Product-policy approval is already recorded separately and does not need to be repeated.

Current public guidance, checked 24 September 2026: [Manual Payouts](https://support.paystack.com/en/articles/2131074), [transfer pricing](https://support.paystack.com/en/articles/2130370), [TEST-mode limitations](https://paystack.com/docs/api/authentication/), [refund lifecycle](https://paystack.com/docs/payments/refunds/). These describe general behavior; they do not supply account-specific approval. TEST settlements are not processed, so live funding timing remains a separate gate.
