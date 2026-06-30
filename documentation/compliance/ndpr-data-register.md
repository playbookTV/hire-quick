# NDPR Data-Processing Register (HireQuick)

Per the Nigeria Data Protection Regulation (NDPR) accountability principle and TRD §14/§23. This register is the field-level inventory of personal data, its purpose, lawful basis, retention, and deletion path. **Pending counsel review** (TRD §23 item 9).

**Controller:** HireQuick. **Last reviewed:** 2026-06-21.

## Personal data inventory

| Data | Model.field | Purpose | Lawful basis | Retention | Deletion path |
|---|---|---|---|---|---|
| Phone number | `User.phone` | Account identity, OTP login | Contract | Life of account; tombstoned on erasure | DSAR erase → `deleted:<id>` |
| Email | `User.email` | Notifications, identity | Contract | Life of account | DSAR erase → null |
| Password hash | `User.passwordHash` | Authentication (Argon2id) | Contract | Life of account | DSAR erase → null |
| OTP code hash | `VerificationCode.codeHash` | Login/attendance verification | Contract | `RETENTION_OTP_DAYS` (30) after consume/expire | `jobRetentionPurge` |
| Device push token | `DeviceToken.fcmToken` | Push notifications | Consent | `RETENTION_DEVICE_TOKEN_DAYS` (180) since last seen | `jobRetentionPurge`; DSAR erase deletes |
| Display name | `Client.displayName` | Marketplace display | Contract | Life of account | DSAR erase → "Deleted user" |
| Usher bio | `Usher.bio` | Marketplace profile | Contract | Life of account | DSAR erase → null |
| **ID document** | `UsherVerification.idDocumentUrl` | KYC / identity verification | Legal obligation | Raw doc deleted `RETENTION_KYC_VERIFIED_DAYS` (90) after VERIFIED / `RETENTION_KYC_REJECTED_DAYS` (30) after REJECTED — only the pass/fail flag + reviewer/audit record persist (TRD §14) | `jobRetentionPurge` deletes object + tombstones ref; DSAR erase also clears |
| **Selfie (biometric)** | `UsherVerification.selfieUrl` | KYC liveness | Legal obligation | Raw selfie deleted 90 days after VERIFIED / 30 after REJECTED (TRD §14); not part of the 7-year financial trail | `jobRetentionPurge` deletes object + tombstones ref; DSAR erase also clears |
| Bank account number/name | `BankAccount.accountNumber` / `accountName` | Payouts | Contract | 7 years (financial record) | DSAR erase → "REDACTED" (row retained for ledger FK) |
| Paystack recipient code | `BankAccount.paystackRecipientCode` | Transfer routing | Contract | 7 years | DSAR erase → null |
| Authored messages | `Message.content` | In-app chat | Contract | `RETENTION_CHAT_DAYS` (180) after the booking's dispute window closes, then deleted (TRD §14) | `jobRetentionPurge` deletes message + media object; DSAR erase → redacted |
| Authored reviews | `Review.comment` | Marketplace reputation | Legitimate interest | Life of account | DSAR erase → null |
| Dispute text | `Dispute.reason` / `note` | Dispute handling | Contract / legal | 7 years (financial trail) | DSAR erase → redacted |
| Financial records | `Order`, `EscrowLedger`, `WalletLedger`, `Withdrawal`, `Payment` | Escrow, payouts, reconciliation | Legal obligation | **7 years**, then purge | retained through erasure |
| Audit log | `AuditLog` | Accountability, security | Legal obligation | 7 years | retained (tamper-evident chain) |

## Data-subject rights (implemented)

- **Access / portability:** `GET /api/me/export` returns a machine-readable bundle. Audited as `dsar.export`.
- **Erasure:** `POST /api/me/erase` pseudonymizes all PII above, sets `User.status = ANONYMIZED` + `anonymizedAt`, and **retains financial/ledger rows** for the 7-year obligation. Idempotent. Audited as `dsar.erase`.

Erasure is **pseudonymization, not deletion**: `Review`/`Dispute`/`Message`/`AuditLog` hold `Restrict` FKs to `User`, and financial records must survive retention — so a hard delete is neither possible nor lawful.

## Retention enforcement

`jobRetentionPurge` (daily 02:41 UTC) deletes transient PII past its window — OTP codes and stale device tokens — and never touches financial/ledger rows. `jobAuditVerify` (daily 02:47) checks audit-chain integrity.

## Open items (counsel)

- Confirm retention windows (TRD §23 item 9): currently 30 d OTP, 180 d device tokens, 90 d / 30 d raw KYC docs (verified / rejected), 180 d chat after the dispute window, and 7 y for the financial/KYC *trail* (ledger, not raw documents).
- Confirm lawful-basis mapping per field.
- Cross-border transfer assessment (Paystack, Brevo, Neon, storage provider).
