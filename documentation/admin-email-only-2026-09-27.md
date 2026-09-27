# Email-only admin accounts — 27 September 2026

Status: **FIXED AND VERIFIED**. API, worker and admin are deployed successfully; the tracked migration is applied and `review@lyba.io` is an active ADMIN with a null phone. The existing admin account is unchanged. A separate pre-existing audit-chain mismatch is documented below.

## Cause and correction

Admin email OTP already authenticates an existing active admin using its email and account ID. Account creation nevertheless required `User.phone`, inherited from the mobile account model. The original reproduction failed with `Argument phone is missing` when creating an admin with an email alone.

`User.phone` is now nullable. A tracked database constraint permits a null phone only for an ADMIN with a nonblank email. Clients and ushers still require phones, including direct database writes. Phone OTP request/verification validation is unchanged. Email OTP cannot register users or grant admin access.

The auth response type accepts a null phone. Identity verification explicitly requires a phone before contacting its provider. Admin approval records include maker/checker email, and the admin interface uses that email for identification. The users list displays a dash for an absent phone.

## Migration

`20260927130000_email_only_admin` drops the phone NOT NULL constraint and adds `users_phone_or_admin_email_check`, in one transaction. It does not rewrite existing users. The phone unique index remains; PostgreSQL allows multiple null values.

`pnpm db:migrate --create-only` was attempted against disposable database/shadow schemas, but Prisma reported namespace drift. No reset was performed. Both temporary schema pairs were removed. The tracked migration instead uses Prisma's exact before/after datamodel diff (one ALTER TABLE), extended with the role/email CHECK. Disposable migration deployment and drift checks validate the result.

## Release scope

The deployment snapshot is based on the verified existing `hq-20260925T223233Z` release and the running API source, with only the admin-account correction and regression support applied. Local payment-policy, authentication-role-refresh, mobile, and design changes that are not deployed are excluded. The release retains the nine existing migration checksums plus this admin migration; it excludes the local pending client-paid-fee migration.

The API and worker need the regenerated nullable-phone database client before the new account is inserted. The admin interface also receives the identification changes. The existing `hirequickng@gmail.com` account and its phone number must remain unchanged.

## Verification

- Before-fix reproduction: creating an email-only admin failed with Prisma's missing-phone validation.
- Workspace application typechecks, lint, test typechecks, and test lint passed after correcting the nullable-phone assertion in the existing erasure test. Existing lint warnings remain.
- The isolated deployment snapshot's API/admin builds, lint and API test typechecks passed.
- Workspace focused regression: **66/66 passed** across five suites; tracked migrations, zero Prisma schema drift, and disposable-schema cleanup passed.
- Exact deployment snapshot: **79/79 passed** across six suites, including 17 identity-verification cases. Tracked migrations, zero Prisma schema drift, and disposable-schema cleanup passed.
- New database-backed tests exercise multiple null-phone admins, email OTP sign-in, authenticated admin access, refresh, consumed-code rejection, direct-write constraints, mandatory mobile phone validation, and refusal of public admin registration.
- An initial mobile test attempt inherited SMS-provider settings and received delivery failures. It was stopped and its disposable schema removed; the validation runner now clears KudiSMS and Twilio credentials as well as Brevo.

## Operational limits

No real inbox sign-in is performed by the regression tests. They mock email delivery and use disposable database schemas. Creating the requested account does not send a code; the user requests one from the admin sign-in page.

Keep the nullable schema and compatible application build together. Reverting to the old required-phone client after inserting a null-phone account can cause reads to fail; do not roll back application compatibility alone.

## Live verification and evidence

- API: `9c09bdb1-f945-410d-bb64-610cf0f6f1cf` — SUCCESS.
- Worker: `70a31da4-f096-413d-a768-fbb784bb7dec` — SUCCESS.
- Admin: `fec10f6a-1fe9-4994-a454-a00d51dfd002` — SUCCESS.
- Both backend clients report the phone field as optional. Worker source hashes match the frozen release manifest. API health and readiness return 200; protected admin users returns 401 without authentication. Admin JavaScript and CSS match the tested build byte for byte.
- Live migration preflight matched all nine existing checksums and found only the intended admin migration pending. Deployment succeeded; the phone column is nullable and the role/email CHECK is validated.
- Created admin `e2e04354-e6a5-4ded-8b4e-ccff4ccf809d` for `review@lyba.io`, ACTIVE, phone null. Case-insensitive account lookup confirms exactly one eligible admin. Existing admin `8175f3e6-b1c9-4b4b-94fa-74d31ac0e32e` retains its original email, phone, role and status.
- The creation audit entry (sequence 493) has a valid hash. Full-chain verification separately fails at sequence 30, an `auth.login` entry dated 21 June 2026. Its date and sequence establish that it predates this provisioning. The cause of that older hash mismatch was not investigated here, and no historical audit entries were altered. This is an integrity finding, not proof of malicious tampering.

Evidence: [release manifest](validation-evidence/2026-09-27/email-only-admin/release-manifest.json), [deployments](validation-evidence/2026-09-27/email-only-admin/deployments-after.json), [HTTP checks](validation-evidence/2026-09-27/email-only-admin/http-checks.json), [account verification](validation-evidence/2026-09-27/email-only-admin/account-verification.json), [audit check](validation-evidence/2026-09-27/email-only-admin/audit-check.json).

[Open the admin console](https://hirequick-admin-production.up.railway.app) and request a sign-in code for `review@lyba.io`. No phone or password is needed. Real inbox delivery and completed user sign-in remain untested in this change.
