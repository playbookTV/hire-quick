# Login and attendance code verifiers

Login and attendance codes expire after ten minutes and allow at most five incorrect submissions. A client can generate a replacement attendance code; it immediately expires the previous code. Login requests likewise replace the previous code and are limited to five per phone per hour. Issuance and guesses serialize in database transactions, including across API processes. Attendance consumption and `markCheckedIn` commit together; login consumption, user changes, token signing and the login audit append commit together. Transient failures roll everything back so the original code can be retried.

`VerificationCode.codeHash` contains `v1:<key-id>:<HMAC-SHA256>` over a canonical encoding of the version, key ID, purpose, phone/booking subject, record UUID and code. The managed secret is separate from the database. Copying a verifier to another record, subject or purpose does not make it valid. Old unkeyed SHA-256 records are rejected immediately; request a new login code or have the owning client generate a new attendance code after deployment. No database migration is needed.

Configure a cryptographically random secret of at least 32 characters in the deployment secret manager as `OTP_VERIFIER_SECRET`, with an identifier in `OTP_VERIFIER_KEY_ID`. Staging and production refuse to boot without it. All API replicas that issue or verify codes must share this configuration. Do not reuse JWT/provider credentials. Development and isolated tests may leave the secret empty; a random process-local key then invalidates outstanding codes on restart. No secret or code is logged; only isolated `NODE_ENV=test` receives login codes directly. The owning client still receives their attendance code in all environments.

For a rotation without interrupting outstanding codes:

1. Generate the next secret in the secret manager. Deploy it as `OTP_VERIFIER_PREVIOUS_SECRET` and its new ID as `OTP_VERIFIER_PREVIOUS_KEY_ID` while keeping the old key current. Despite its name, this verification-only slot can first stage the next key. Wait for every replica to accept both keys.
2. Switch the next key to current and the old key to previous across the fleet. New codes use the current key; both deployments can verify either key during the rollout.
3. After the last old-key issuer has stopped, wait at least ten minutes, then remove both previous-key settings from every replica. Verification enforces both stored expiry and a maximum ten-minute age, so keeping a previous key cannot extend a code's lifetime.

For compromise response, remove the affected key immediately and accept that its outstanding codes require reissue. IDs must differ; a previous ID/secret must be configured together. Never store actual deployment secrets in this file, `.env.example`, tests, logs, or ticket evidence.
