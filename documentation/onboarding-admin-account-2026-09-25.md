# Mobile profile setup: existing admin account

## Finding

The reported Android build 9 setup loop was traced to an existing ADMIN account with neither a client nor an usher profile. OTP sign-in correctly preserves an existing account’s role. Mobile onboarding treated the admin as a client; PATCH /api/me returned success without writing a profile, and routing back to setup cleared the local form.

The account was inspected read-only. Its role and records were not changed.

## Change

- AuthProvider intercepts authenticated ADMIN users before mobile onboarding can mount, including restored sessions. It explains the phone-number conflict and provides sign-out.
- OTP completion does not navigate an admin into onboarding.
- PATCH /api/me uses the stored role, rejects unsupported roles and missing profiles, and refuses to report success when no editable fields were supplied. It updates only the profile for the stored role.
- GET /api/me remains available for admin-console sign-in.

## Validation

- 8 HTTP regression tests with a mocked database: admin rejection, admin reads, missing client/usher profiles, usher save and readback, stored-role isolation, no-op rejection, save failure.
- 23 existing mobile session tests passed.
- Mobile typecheck/lint, API typecheck, targeted API/test lint, and whitespace checks passed.
- Browser interaction harness used the actual AuthProvider, session coordinator, session store, and mobile components with a memory storage adapter and fixture API. Verified restored-admin notice, sign-out, usher access, and fresh-admin notice. This was not a physical Android test or a complete navigation-stack test.

## Delivery

These changes are local and have not been deployed or included in a new native build. Android build 9 and iOS archive build 3 remain unchanged. An usher account currently requires a phone number separate from the existing admin account.
