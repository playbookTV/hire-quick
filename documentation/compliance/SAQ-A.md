# PCI-DSS SAQ-A — Self-Assessment (HireQuick)

**Status:** Eligible and met. **Last reviewed:** 2026-06-21. **Owner:** Engineering / Compliance.

## Why SAQ-A applies

SAQ-A is the lightest PCI-DSS self-assessment, for merchants who **fully outsource** all cardholder-data functions to a PCI-DSS-validated third party and **never store, process, or transmit cardholder data** on their own systems.

HireQuick takes card payments exclusively through **Paystack** (PCI-DSS Level 1 validated). All card entry, authorization, and storage happen on Paystack-hosted surfaces. The backend holds only Paystack *references* and *tokens*, never card data.

## Evidence

| SAQ-A requirement | How HireQuick meets it | Evidence |
|---|---|---|
| No PAN stored | No primary account numbers anywhere in the codebase or schema | `grep -ri "pan\|card_number\|cardnumber" apps/api/src` → **0 hits** |
| No CVV/CVC stored | Never captured or persisted | `grep -ri "cvv\|cvc" apps/api/src` → **0 hits** |
| Card flow outsourced | All card handling behind the `PaystackPort` interface; the app receives charge/transfer references only | `apps/api/src/modules/payments/port/paystack-port.ts` |
| Payment pages served by the validated provider | Charges initialized server-side, completed on Paystack | `payments/service.ts` `initChargeForOrder` |
| Confirmation integrity | Webhooks verified by HMAC-SHA512 over the raw body before any ledger effect | `payments/webhooks/paystack-webhook.ts` `verifyPaystackSignature` |
| Secrets not in code | Keys injected via environment, fail-fast validation | `apps/api/src/env.ts` |
| TLS in transit | All Paystack traffic over HTTPS; API terminates TLS at the edge | deployment config |

## Scope boundary

- **In scope (provider):** card capture, authorization, tokenization, settlement — Paystack.
- **Out of scope (HireQuick):** we store `paystackChargeRef`, `paystackTransferRef`, `paystackRecipientCode`, and bank-account numbers for **payouts** (not card data). Payout bank details are not cardholder data and fall under NDPR, not PCI — see `ndpr-data-register.md`.

## Annual maintenance

1. Re-run the PAN/CVV greps after any payments change; keep at 0 hits.
2. Confirm no card fields are added to the Prisma schema.
3. Reconfirm Paystack's PCI validation is current.
4. Re-file this SAQ-A annually and after any significant payment-flow change.
