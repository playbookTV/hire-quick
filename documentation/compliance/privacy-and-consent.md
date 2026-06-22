# Privacy Policy Outline & Consent Records (HireQuick)

Drafting basis for the public privacy policy and the consent-capture mechanism (NDPR / TRD §14). **Pending counsel review.**

## Privacy policy outline (to publish)

1. **Who we are** — HireQuick, controller; contact / DPO details.
2. **What we collect** — see `ndpr-data-register.md` (phone, email, KYC ID + selfie, bank payout details, profile, chat, reviews, device tokens, financial records).
3. **Why** — to operate the staffing marketplace: matching, booking, escrow payments, payouts, KYC, fraud/dispute handling, notifications.
4. **Lawful bases** — contract, legal obligation (KYC, financial records), consent (push notifications, marketing), legitimate interest (reputation, security).
5. **Who we share with** — Paystack (payments), Brevo (SMS/email/WhatsApp), Neon (database), the storage provider (KYC documents). Processors only, under DPAs.
6. **Retention** — per the register: 7 years for financial/KYC, 30/180 days for transient data, life-of-account otherwise.
7. **Your rights** — access, portability, erasure, correction. **How to exercise:** in-app `GET /api/me/export` and `POST /api/me/erase`, or by contacting the DPO.
8. **Security** — TLS in transit, Argon2id passwords, RBAC, rate limiting, tamper-evident audit logging, least-privilege access to KYC documents.
9. **International transfers** — note any processors outside Nigeria and the safeguards.
10. **Changes & contact** — versioning and DPO contact.

## Consent records

**Status: deferred (not yet implemented).** Push-notification and marketing processing rely on consent and should be recorded explicitly. When implemented, capture per event:

```
ConsentRecord { userId, purpose, granted, grantedAt, source, withdrawable }
```

- `purpose` — e.g. `push_notifications`, `marketing`.
- `source` — `explicit` (UI toggle) vs `legitimate_interest`.
- Withdrawal flips `granted=false` and must stop the corresponding processing (and feed the device-token purge).

Until then, device tokens are treated as consent-based and are purged after `RETENTION_DEVICE_TOKEN_DAYS` of inactivity, and erasure deletes them immediately.

## Cross-references

- Field-level inventory: `ndpr-data-register.md`
- Card-data scope: `SAQ-A.md`
- DSAR endpoints: `apps/api/src/modules/privacy/`
