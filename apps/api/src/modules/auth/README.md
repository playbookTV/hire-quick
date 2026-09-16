# Refresh rotation policy

`POST /auth/refresh` atomically inserts the presented JWT's unique `jti` into the existing denylist, signs a successor pair, and appends `auth.refresh` to the audit chain in one database transaction (TRD §§7 and 14). The response is returned only after commit. An insert, signing, audit, or transaction failure returns no pair and rolls back consumption so the old token can be retried.

Concurrent reuse produces at most one successor pair. A duplicate or logged-out token returns `401 INVALID_REFRESH`; duplicate detection does not invalidate the winning successor. The repository has no session-family graph, so this is deliberately token-scoped rotation and logout, with no family-wide reuse revocation. Logout of an already rotated ancestor cannot revoke its successor; the client must send its current refresh token. Independent logins remain independent.

A response lost after the database commit cannot be recovered by replaying the consumed token; the user must sign in with OTP again. Returning the winning successor to a reused token could disclose it to an attacker. Access tokens remain subject to their expiry and the HTTP account-status check.

Refresh JWT verification requires HS256 plus an explicit refresh type, UUID subject/JTI, and unexpired expiry. Missing or malformed claims cannot reach database rotation.

`refresh-rotation.test.ts` exercises real PostgreSQL concurrency and rollback, while `tokens.unit.test.ts` covers JWT claims without database queries. Database tests must use the disposable validation runner or isolated CI database; do not run them against the unisolated configured database.
