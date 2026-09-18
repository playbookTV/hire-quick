# Security and privacy implementation

[Documentation index](README.md) · [Reporting concerns](../SECURITY.md) · [Configuration](CONFIGURATION.md)

This guide describes controls and limitations in the repository. It is not a claim of certification, legal compliance, or completed operational review. The [compliance records](../documentation/README.md#compliance-records) and product requirements retain their own evidence and open decisions.

## Identity and sessions

Phone OTP login uses a verifier bound to its purpose, subject, and record, with expiry, attempt limits, and per-phone issuance limiting. New issuance supersedes earlier unconsumed codes. Verification stores no reusable plaintext code. Follow the [OTP verifier/key-rotation note](../documentation/otp-verifiers.md) when changing secrets or retiring legacy verifiers.

Public signup accepts CLIENT/USHER only. Admin access requires an existing ADMIN identity. HTTP verifies the access JWT and live ACTIVE account status, then applies route/service ownership and role checks. Refresh consumes a JTI atomically; logout revokes the presented refresh token. Revocation is token-scoped, not family-wide, and an already issued HTTP access token remains governed by its expiry and account checks.

Socket connections require session-bound tokens and reauthorize incoming actions and outgoing private delivery against current session/account/role state. After refresh, reconnect with the successor access token. See [realtime authorization](../apps/api/src/realtime/README.md) for exact timing and limits.

## Boundaries and private data

- Helmet, CORS configuration, Redis-backed rate limiting, DTO validation, and generic unexpected-error responses protect the HTTP boundary. Proxy trust must match deployment topology.
- Paystack and Dojah webhooks receive raw bodies before JSON parsing. Each provider adapter authenticates its callback; a client assertion is not authoritative payment or identity evidence.
- Venue details are masked until the usher qualifies through booking/payment state. Applicant listing does not expose phone numbers.
- Storage uses server-issued private keys and short-lived signed URLs. Upload and read routes enforce ownership and content-type restrictions. A signed URL is a temporary capability; never put it into public logs, issues, or sample docs.
- Chat access checks party membership and current booking state. Realtime room membership alone is not continuing authorization.
- Admin verification reads are audited. Maker-checker separates large monetary decisions from their initiator.

Development/test fallbacks are not equivalent security configurations. The normal server constructs real Redis/provider adapters; staging/production environment guards require stronger settings, and production `createApp` additionally requires CORS and a Redis limiter client.

## Financial integrity

Amounts are bounded integer kobo. Append-only escrow/wallet histories and centralized balance writes preserve traceability. Transactions, locks, legal state transitions, immutable provider references, durable intent records, and reconciliation address retries and concurrent changes.

Do not attempt incident repair by rewriting ledger rows, manually adjusting wallet balances, deleting idempotency records, or clearing provider dispatch markers. Follow [Operations](OPERATIONS.md) and obtain reviewed application-level repair behavior where a needed operation is not implemented.

## Data subject workflows

The API provides own-account data export, consent management, current-policy acceptance, and account erasure. Erasure pseudonymizes identity/profile data while retaining financial and audit history; it is not a cascading delete of all user-related rows. Consent withdrawal must stop the relevant processing; withdrawing push permission removes device tokens.

Retention jobs purge selected expired/old OTP, device, KYC, chat, and refresh-denylist records. Their configurable windows are listed in [Configuration](CONFIGURATION.md#retention). The job's chat cutoff uses event date plus an additional safety margin, rather than an exact persisted dispute-close timestamp.

Object deletion is best effort. In particular, removing or tombstoning a database reference does not prove an object was removed from storage or backups. Operators must investigate failed deletes and verify storage/backup retention separately. Do not report data erasure as globally complete solely from the API response.

## Secrets and evidence

Use deployment-managed secrets for JWT/OTP/provider/database/storage credentials. Do not commit `.env`, `.mcp.json`, service-account keys, access/refresh tokens, OTPs, signed URLs, or unredacted customer/provider records. `VITE_*` and `EXPO_PUBLIC_*` values are public bundle data.

Use synthetic identities and amounts for documentation/tests. Review logs before sharing; request IDs and operation references aid investigation, but linked records may contain personal or financial information. Restrict incident evidence and preserve audit integrity.

## Security changes and review

Review authorization on both success and error paths, old-session responses, retries, and concurrent state changes. Tests should include another user's resource IDs, inactive accounts, stale sessions, malformed callbacks, replay, and storage-key substitution where applicable. Consult [Testing](TESTING.md) for isolation.

After changes to identity, policy, retention, provider handling, or sensitive fields, update the data register and implementation guides. Provider/compliance decisions belong in the relevant specification and approved decision record; code comments alone do not close an open requirement.
