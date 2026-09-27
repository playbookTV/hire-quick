# Paystack account confirmation request — OVA-166

Prepared 24 September 2026; updated 26 September 2026. **Draft only; not sent.** The owner has chosen a separate HireQuick Paystack account; the earlier Ovalay Academy TEST integration is not the intended launch account. Send through the HireQuick account owner's authenticated Paystack support channel, attaching the legal entity and integration identifier privately once provisioned/confirmed. Never attach API keys, customer data or identity documents to this repository or Linear.

## Message

Subject: HireQuick Nigeria — confirmation of marketplace held funds, manual payouts and transfer terms

Hello Paystack Support,

We are preparing HireQuick, a Nigerian event-staffing marketplace, for launch using a dedicated HireQuick Paystack account and need written confirmation of the permitted setup and registered-business onboarding requirements.

Clients pay the agreed staff amount plus a 15% HireQuick platform fee through Paystack-hosted checkout. For example, ₦10,000 staff pay plus ₦1,500 platform fee means a ₦11,500 client payment. We allocate each payment across the booked staff. Funds remain held until verified attendance and the end of a 72-hour dispute period following the event. Unresolved disputes keep the affected allocation on hold. On release, the full agreed staff amount becomes the usher's withdrawable earnings; the separately added fee becomes HireQuick revenue. Ushers request bank withdrawals; HireQuick periodically transfers available earned platform funds to its operating account after accounting for provider costs and customer obligations.

Client cancellation refunds are 100% more than 48 hours before the event, 50% from 12 through 48 hours inclusive, and 0% below 12 hours. Each refund percentage applies proportionally to staff pay and the added platform fee. A 50% refund on ₦11,500 returns ₦5,750, leaving ₦5,000 for the usher and ₦750 for HireQuick. Usher cancellation or no-show returns the affected booking's full client payment including the fee. We do not deduct processing fees from the promised client refund or usher entitlement; HireQuick bears provider costs.

Please confirm the following specifically for our account, including effective dates and any conditions:

We have read your ineligible-business guidance listing escrow services as unsupported and the merchant agreement's restrictions on payment aggregation. Please first assess whether the model described above falls within those restrictions. We are not assuming that Manual Payouts activation authorizes it; if unsupported, please identify any permitted product or partner arrangement and the changes it requires.

1. Is this attendance/dispute-conditioned holding model permitted, and what merchant, safeguarding or licensing obligations apply to HireQuick? May released usher earnings remain withdrawable in our balance, or must they be transferred immediately?
2. Is our entity approved for Manual Payouts and the required Nigerian partner account? Please confirm activation evidence, settlement-to-balance timing, maximum holding periods, balance ceilings, inactivity/automatic-settlement rules, and whether the previously documented 90-day assumption applies.
3. What beneficiary identity, account-name matching and verification requirements apply to individual ushers? Please confirm transfer minimums, per-transfer and daily limits, and any limits specific to our account.
4. Please confirm collection, refund, transfer, stamp-duty/levy and reversal charges; where each is debited; and whether original collection fees are returned on full or partial refunds. May platform commission be transferred to our own operating account?
5. An earlier, separate TEST integration required OTP approval for a transfer. What approved operating process and security configuration should the new HireQuick account use for customer withdrawals and scheduled platform transfers? We will verify the new account independently and have not disabled OTP protection.
6. How should we distinguish collected-but-unsettled money from available transfer balance, opening balances, top-ups and provider charges in reconciliation? Please confirm the coverage, retention and pagination of GET /balance/ledger, how fees and reversals appear, and which settlement reports/API records link net credits to individual charges. We need to avoid counting a fee twice when it is already included in a net balance movement.
7. Which pending, reversed, failed, insufficient-balance, refund and webhook-delivery scenarios can be reliably reproduced in TEST mode? Please identify anything that requires a separately approved controlled live acceptance check.

If our current model is unsupported, please recommend the permitted settlement model and configuration before we enable real customer payments.

Thank you,
HireQuick team

## Evidence required to close OVA-166

Record the named business/account and finance owners; legal entity and account/environment; Paystack case/reference; written answers and approver; date; redacted activation evidence; approved limits/fee schedule; and links to resulting engineering changes and acceptance tests. Product-policy approval is already recorded separately and does not need to be repeated.

Current public guidance, checked 24 September 2026: [Manual Payouts](https://support.paystack.com/en/articles/2131074), [transfer pricing](https://support.paystack.com/en/articles/2130370), [TEST-mode limitations](https://paystack.com/docs/api/authentication/), [refund lifecycle](https://paystack.com/docs/payments/refunds/). These describe general behavior; they do not supply account-specific approval. TEST settlements are not processed, so live funding timing remains a separate gate.
