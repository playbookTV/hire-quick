# HireQuick — Cost-to-Operate & Fee Model

> **Pricing amendment — 26 September 2026:** new checkouts add a 15% client-paid platform fee to agreed staff pay. Ushers receive their full agreed pay. Cancellation percentages apply separately to staff pay and the added fee; the fee is refunded proportionally. Existing orders retain their recorded terms. See [client-paid fee policy](payments/client-paid-fee-policy-2026-09-26.md).


**Version:** 1.0
**Prepared for:** HireQuick
**Prepared by:** Leslie Williams
**Launch market:** Lagos, Nigeria
**Status:** Pre-build estimate
**Vendor pricing as-of:** 2026-06-25 (sources linked inline; re-confirm before budgeting)

---

## 1. Summary & how to read this

This document answers two questions: **what it costs to keep HireQuick running each month**, and **the fees in every transaction** — both what HireQuick charges (15% commission) and what Paystack charges HireQuick to move the money.

The platform's cost has two parts:

| Part                      | Nature                       | Driver                                                  |
| ------------------------- | ---------------------------- | ------------------------------------------------------- |
| **Running costs** (§3)    | Mostly fixed + mild variable | Database, hosting, OTP messages, storage, mobile builds |
| **Transaction fees** (§4) | Purely variable              | Per booking — Paystack's cut of every payment           |

On a typical **₦15,000 staff-pay booking**, the client pays **₦17,250**, HireQuick earns **₦2,250**, and the indicative local Paystack collection charge is **₦358.75**, leaving **₦1,891.25** before transfers, levies and infrastructure. Infrastructure is a small, slow-growing floor; the real cost against revenue is Paystack's per-payment fee.

**Currency note.** Some vendors bill in **USD** (Neon, Railway, Cloudflare R2, Expo) and some in **NGN** (Paystack, Brevo SMS). USD figures below are converted at an assumed **₦1,600 = $1** — _update this rate to today's before presenting._ All money inside the product is integer **kobo** (₦1 = 100 kobo); there are no floats anywhere in the ledger.

**Not modelled here:** Nigerian **VAT (7.5%)** may apply to vendor invoices and to platform commission — confirm with an accountant. Push notifications and error monitoring are **not yet wired** (see §3.2).

---

## 2. Assumptions

Every number downstream traces back to this table. Change these inputs and the rest re-derives.

| Input                                  | Pilot         | Growth           | Scale       |
| -------------------------------------- | ------------- | ---------------- | ----------- |
| Bookings / month                       | 100           | 1,000            | 10,000      |
| Avg booking value (gross)              | ₦15,000       | ₦15,000          | ₦15,000     |
| OTP + notification messages / month    | ~600          | ~5,000           | ~45,000     |
| Active ushers (with KYC docs + photos) | ~200          | ~2,000           | ~20,000     |
| Stored objects (KYC + ~6 photos/usher) | ~0.4 GB       | ~4 GB            | ~40 GB      |
| Database posture                       | scale-to-zero | mostly always-on | always-on   |
| FX rate                                | ₦1,600 / $1   | ₦1,600 / $1      | ₦1,600 / $1 |

> Bookings are **per-usher** — an event needing 5 ushers is 5 bookings. OTP volume is auth/notification-driven (sessions last 30 days, so re-logins are infrequent), not 1:1 with bookings.

---

## 3. Running costs (monthly)

### 3.1 Active services

Each cell is the estimated monthly spend; the formula behind it is in the footnote. Totals are rounded.

| Service                        | What it does                                      | Pilot            | Growth            | Scale             | Pricing basis                                             |
| ------------------------------ | ------------------------------------------------- | ---------------- | ----------------- | ----------------- | --------------------------------------------------------- |
| **Neon** (Postgres)            | Primary database (users, bookings, escrow ledger) | ~$6              | ~$40              | ~$83              | Usage: $0.106/CU-hr compute + $0.35/GB-mo storage [^neon] |
| **Railway** (hosting)          | Runs the API + BullMQ worker + Redis              | ~$15             | ~$45              | ~$100             | Hobby $5/mo or Pro $20/mo min, then usage [^railway]      |
| **Cloudflare R2** (storage)    | KYC documents + usher photos                      | ~$1              | ~$1               | ~$5               | $0.015/GB-mo storage; **egress free** [^r2]               |
| **Brevo** (OTP/SMS)            | Phone-OTP login + notifications                   | ~$2              | ~$19              | ~$169             | Pay-as-you-go SMS, Nigeria ~₦6/msg [^brevo]               |
| **Expo / EAS** (mobile builds) | iOS/Android app builds + OTA updates              | $0               | $0                | ~$99              | Free tier / pay-per-build; Production $199/mo [^eas]      |
| **Total (USD)**                |                                                   | **≈ $24/mo**     | **≈ $105/mo**     | **≈ $456/mo**     |                                                           |
| **Total (NGN @ ₦1,600)**       |                                                   | **≈ ₦38,000/mo** | **≈ ₦168,000/mo** | **≈ ₦730,000/mo** |                                                           |

[^neon]: Neon is usage-based with no monthly minimum. Pilot assumes scale-to-zero (~0.25 CU × ~200 active hrs); Scale assumes 1 CU always-on (720 hrs). Source: [neon.com/pricing](https://neon.com/pricing).

[^railway]: Railway bills the subscription as a minimum that includes usage credit, then per-minute compute. API + worker + Redis share one usage pool; a typical full-stack app runs $35–40/mo. Pro plan supports a **hard spend cap**. Source: [railway.com/pricing](https://railway.com/pricing).

[^r2]: R2 charges $0.015/GB-month storage, $4.50/M Class A and $0.36/M Class B operations, and **no egress fees** — a major saving for an image-heavy app. Source: [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/).

[^brevo]: Brevo SMS for Nigeria is pay-as-you-go; the exact rate is shown live in-account (a representative ~₦6/SMS is used here). **WhatsApp utility messages are materially cheaper** — see §6. Source: [brevo.com/pricing](https://www.brevo.com/pricing/).

[^eas]: The Expo framework is free. Builds are intermittent (release-driven, not per-user), so a pilot lives on the free tier / pay-per-build. The $199/mo Production plan (50k MAU, OTA updates) only makes sense at Scale. Source: [expo.dev/pricing](https://expo.dev/pricing).

> **Redis** is a Railway service and bills into the Railway usage pool above — it is not a separate line. A managed alternative (e.g. Upstash free tier) is an option at Pilot.

### 3.2 Not yet wired — near-term future costs

These are referenced in the product but **not currently configured**, so they cost ₦0 today. Budget for them before launch:

| Service                              | Purpose                           | Rough cost when added                          |
| ------------------------------------ | --------------------------------- | ---------------------------------------------- |
| Push notifications (Expo Push / FCM) | Mobile push for booking lifecycle | Free (FCM) to low; bundled with EAS Update MAU |
| Error monitoring (Sentry or similar) | Production error tracking         | $0 (free tier) → ~$26/mo                       |
| Analytics                            | Product metrics                   | $0 (free tier) → usage-based                   |

---

## 4. Fee model (per booking)

HireQuick adds a **15% client-paid platform fee** to agreed staff pay (`priceBooking` in [money.ts](../packages/shared/src/money.ts)). The usher receives 100% of agreed pay. Fees round down per booking in integer kobo before the batch total is calculated.

Paystack's [published Nigerian pricing](https://paystack.com/pricing), checked 26 September 2026, lists local collection at **1.5% + ₦100**, capped at **₦2,000**. Only the fixed ₦100 component is waived below ₦2,500; the percentage fee still applies. Provider charges apply to the **client total including the platform fee**. Account-specific fees and levies still need reconciliation evidence.

| | Small | Typical | Large |
| --- | ---: | ---: | ---: |
| Agreed staff pay / usher payout | ₦2,000 | ₦15,000 | ₦150,000 |
| Added platform fee | ₦300 | ₦2,250 | ₦22,500 |
| Client total | ₦2,300 | ₦17,250 | ₦172,500 |
| Indicative local collection fee | ₦34.50 | ₦358.75 | ₦2,000 |
| Contribution before transfers, levies and infrastructure | ₦265.50 | ₦1,891.25 | ₦20,500 |

These estimates assume a single local charge per booking. A batch is charged once, so its fixed fee/cap applies to the batch total. Refunds and cancellation revenue follow the [proportional policy](payments/client-paid-fee-policy-2026-09-26.md).

### 4.1 Payout & withdrawal fees

The actual bank transfer to the usher happens at **withdrawal**, not at release. Paystack's transfer fee is tiered (~₦10 ≤ ₦5k, ~₦25 ₦5k–50k, ~₦50 > ₦50k).

The wallet debit and transfer principal are the requested withdrawal amount. The code does not subtract a provider transfer fee from that principal. Paystack checks its balance for [principal plus the transfer fee](https://paystack.com/docs/transfers/how-transfers-work/). The former claim that an usher automatically receives a reduced amount was unsupported; track provider charges separately as platform costs and validate account-specific treatment.

HireQuick collects its own commission by sweeping accumulated fees to its operating bank account once they exceed a **₦100 floor** ([service.ts](../apps/api/src/modules/payments/service.ts)). Sweeping in batches (a daily job) amortises the transfer fee across many bookings, so the platform's payout cost is negligible per booking.

---

## 5. Combined: platform P&L per tier

Revenue is the sum of commissions; cost is Paystack charge fees plus infrastructure. At ₦15,000 agreed staff pay: ₦2,250 platform fee and an indicative ₦358.75 local collection fee on the ₦17,250 client charge. These estimates exclude transfer fees, levies, refunds and disputes.

| Monthly                | Pilot (100)    | Growth (1,000)   | Scale (10,000)    |
| ---------------------- | -------------- | ---------------- | ----------------- |
| Commission revenue     | ₦225,000       | ₦2,250,000       | ₦22,500,000       |
| − Paystack charge fees | (₦35,875)      | (₦358,750)       | (₦3,587,500)      |
| − Infrastructure (§3)  | (₦38,400)      | (₦168,000)       | (₦729,600)        |
| **Net contribution**   | **₦150,725** | **₦1,723,250** | **₦18,182,900** |
| Contribution margin    | ~67%           | ~77%             | ~81%              |

> HireQuick is contribution-positive even at pilot scale. Infrastructure is a shrinking share of total cost as volume grows (~54% at Pilot → ~18% at Scale), because the fixed monthly floor is spread over more bookings; **Paystack's per-payment fee then becomes the dominant cost** against commission. Figures exclude VAT, refunds, and disputes.

---

## 6. Cost-control levers

Ordered by impact:

1. **Use WhatsApp OTP instead of SMS.** Brevo's WhatsApp utility conversations are materially cheaper than SMS in Nigeria. At Scale this swaps the ~$169/mo Brevo line for roughly a third of that — the single biggest variable saving. The code already supports a WhatsApp OTP channel ([env.ts](../apps/api/src/env.ts) `BREVO_WHATSAPP_*`); it needs a connected WhatsApp Business Account + approved template.
2. **Keep Neon scale-to-zero at Pilot.** Compute only meters while the database is awake; an always-on instance runs the meter 24/7. Worth ~$70/mo at Scale.
3. **Set a Railway spend cap (Pro plan).** Hard ceiling prevents a runaway usage bill.
4. **R2's free egress is already a structural win** — serving usher photos costs nothing in bandwidth, unlike AWS S3.
5. **Batch the commission sweep** (already a daily job) so one transfer fee covers thousands of bookings.
6. **Decide who bears the withdrawal transfer fee** (§4.1) — currently the usher. Absorbing it improves usher experience at ~₦25/withdrawal cost to the platform.

---

## 7. Open items for the client

- **Confirm the FX rate** (₦/$ ) used in §3 before budgeting — naira rates move.
- **Confirm the Brevo Nigeria SMS rate** in-account; consider WhatsApp OTP (§6.1).
- **VAT (7.5%)** treatment on vendor costs and on commission — confirm with an accountant.
- **Withdrawal transfer fee bearer** — usher (current) vs platform-absorbed.
