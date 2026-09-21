# Seeded staging QA login — 21 September 2026

The mobile quick-login buttons expected `devCode`, but the deployed API only echoed codes in isolated tests. Requests could return 200 while quick login still failed. The API now supports explicitly enabled QA access for four exact seeded identities.

## Configuration and boundaries

- `STAGING_QA_OTP_CODE`: server-only six-digit shared test code, empty by default. Do not commit its value or put it in an `EXPO_PUBLIC_*` variable.
- Startup rejects a configured QA code unless `NODE_ENV=staging` and the Paystack secret begins `sk_test_`.
- Runtime checks the same restrictions and requires the existing account to be ACTIVE with the exact phone, email and role below. No accounts are created and no roles are granted by QA mode.
- Other phones use normal SMS/WhatsApp delivery and receive no echoed code in staging.
- QA verification records use `qa-auth:<phone>` subjects, preserving managed HMAC hashing, ten-minute expiry, single-use consumption, five-guess lockout, five requests per phone per hour, session signing and audit logging. Issuance limits count both normal and QA subjects.
- Disabling the mode or changing an identity prevents verification of outstanding QA records. Rotating the shared code also invalidates the previous value.

| Phone | Seeded identity | Role |
| --- | --- | --- |
| +2348100000001 | client.test@hirequick.dev | CLIENT |
| +2348100000011 | usher.a@hirequick.dev | USHER |
| +2348100000012 | usher.b@hirequick.dev | USHER |
| +2348100000013 | usher.c@hirequick.dev | USHER |

Existing profile edits are preserved; names shown in the application can differ from the original seed labels. Profiles that have not completed setup still follow the normal setup flow.

## Client use

In Expo Go, reload and select one of the four quick-login buttons. In the installed APK, enter one of the numbers, tap Send code, and enter the privately supplied shared code. Request a code before each login; the issued verification record expires after ten minutes. The installed APK does not need a rebuild for this server change.

## Deployment

API: `https://prolific-love-production-2775.up.railway.app`

Railway service: `prolific-love` in project `396c28f8-30ac-4fd8-ba96-684e9a27d0e6`. Railway calls the environment `production`, but the API runtime is explicitly `NODE_ENV=staging` and uses Paystack TEST keys.

Deployment: `d715ba54-1296-480b-bf81-c1f25b5b7981`. Source upload is based on the previously deployed email-login release, with only the five API implementation/test files changed. The mobile SDK 57 upgrade is not part of this server deployment. No database migration or full reseed is needed.

To disable QA login, clear `STAGING_QA_OTP_CODE` and redeploy the API. To rotate it, replace that server setting and redeploy. Do not change `NODE_ENV` to `test` on a deployed service.

## Validation

- 91 focused tests pass across staging QA, environment validation, OTP hashing and mobile session lifecycle.
- API build and test typecheck pass; changed API source and tests pass lint.
- Mobile typecheck and changed quick-login files pass lint.
- Four active seeded identities were confirmed against the staging database before deployment.
- Live login evidence is recorded in `validation-evidence/2026-09-21/staging-qa-login.json` after verification. The evidence excludes codes and session tokens.

## Provider access after deployment

The running container reports the expected deployment ID, staging mode and QA enabled. A read-only Brevo account request returned HTTP 401 `unauthorized`, identifying the new outbound IP `152.55.184.206`. Brevo's unknown-IP protection remains enabled. The user must authorize this exact address in Brevo before ordinary SMS/email delivery can resume; no further API deployment is needed. Seeded QA login bypasses delivery only for the four allowlisted identities and is unaffected. No real OTP messages were sent as part of these checks.
