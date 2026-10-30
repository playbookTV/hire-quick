# Weekly payouts — decisions, 23 October 2026

Leslie Williams answered the seven open questions in the [weekly payouts proposal](weekly-payouts-proposal-2026-10-23.md) in the development session on 23 October 2026. This record states the answers and their consequences for implementation. It records product decisions only. It does not record Paystack approval of the account model (OVA-166), a change to any Paystack setting, or a deployment.

| # | Question | Decision |
| --- | --- | --- |
| 1 | How is the platform fee stated, and at what rate? | **Added on top of the usher's agreed pay, at 15%.** The fee becomes an admin setting; the starting value is the current rate. |
| 2 | Payday | **Thursday.** The run is built at 09:00 Africa/Lagos (08:00 UTC). |
| 3 | 72-hour hold after the event | **Kept.** Release to the wallet still requires event end + 72 hours and no unresolved dispute ([OVA-136](approved-settlement-policy-2026-09-21.md)). |
| 4 | Where funds wait until payday | **Option A: the Paystack balance.** Payouts leave by Paystack transfer. The account's payout schedule must read "Settled to Balance". |
| 5 | Paystack transfer OTP | **Kept on for phase 1.** Each transfer in a run waits for the account owner's OTP before Paystack sends it. Turning it off is deferred to phase 2, together with the transfer approval URL. |
| 6 | Limits | **Minimum payout ₦1,000** (smaller balances roll over). Phase 2 automatic-execution caps: **₦2,000,000 per run** and **₦200,000 per usher**. |
| 7 | Early withdrawal before payday | **No.** Usher-initiated withdrawals are switched off when weekly runs go live. |

## Consequences

- **Fee.** At 15% no price changes, so the mobile roster check that hard-codes 15% does not break anything yet. Before any future rate change, a mobile build that reads the rate from the server must ship and old builds must be retired (proposal §3.2). Each order and booking records the rate it was priced at.
- **Phase 1 dispatch with OTP on.** Paystack reports an OTP-gated transfer as `otp`, which the adapter treats as pending. The payout screen must let an admin enter the OTP for each line, which finalizes that transfer through Paystack's finalize endpoint, and resend an OTP. The person entering codes needs access to the account owner's OTP channel. The withdrawal stays `PROCESSING` with its wallet debit intact until Paystack confirms the outcome.
- **Bulk transfers.** Paystack's bulk endpoint requires OTP to be off, so phase 1 uses single transfers through the existing transfer runner.
- **Prerequisites unchanged.** Pre-launch TEST balances must be cleared and ushers must re-add bank accounts against the live key before the first run ([23 October production switch](../deployment-production-mode-2026-10-23.md)).
