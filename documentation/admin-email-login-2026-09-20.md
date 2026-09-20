# Admin email sign-in — 20 September 2026

API and admin releases are deployed successfully. The user approved `noreply@lyba.io` as a temporary sender, displayed as HireQuick. The sender setting is live. After the user authorized outbound IP `152.55.185.15`, the live sign-in-code request for the configured admin returned HTTP 200 with `{"sent":true}`. Provider acceptance is verified; inbox receipt and completed sign-in remain for the user to confirm.

## Scope

The admin console now requests sign-in codes by email using `/auth/admin/otp/request` and `/auth/admin/otp/verify`. Only an existing ACTIVE ADMIN account is eligible. The user-supplied email was attached to the existing admin account with an audit entry and a case-insensitive conflict check. These endpoints cannot create accounts or grant roles. Mobile phone login is unchanged.

Codes are hashed and bound to the email, account and verification record. They expire after ten minutes, allow five incorrect attempts, and are consumed once. Requests are capped at five per hour per account/email. Delivery rejection invalidates the issued code. Unknown addresses receive generic confirmation; rate-limit and provider-failure responses can still disclose eligibility. Strict indistinguishability is not claimed.

`BREVO_EMAIL_SENDER` makes the sender configurable, retaining `no-reply@hirequick.app` as the default. A verified sender and authorized server IP are necessary for delivery.

## Source and deployments

- Frozen source: `/private/tmp/hirequick-email-release-20260920`.
- Upload: `/private/tmp/hirequick-email-upload-20260920`, source files only.
- Based on the earlier September 20 manual-KYC release plus 13 explicitly selected changed/new files. Unrelated workspace changes were not uploaded.
- 420 files; source digest `62577ab2c8a84e04bd7cdd461abe01f733a6bf920bd2b7114a2c3391db68a9eb`.
- [Source manifest](validation-evidence/2026-09-20/admin-email/release-manifest.json).
- API code deployment `54765aa3-3800-46db-8f24-a9bdbcc64e13`: SUCCESS, superseded by sender-configuration redeployment `1017d636-178e-46db-835c-fd41ceb3eb6c`: SUCCESS.
- Admin deployment `190529cc-0766-40e9-b1a3-cde45cbe96f8`: SUCCESS.
- Worker remains on `92ead8e2-2535-4b92-9921-3496c6fad08c`; Redis was not redeployed. No schema migration or financial data changes were required.

## Validation

- API/admin builds and dependency builds: 4/4 tasks passed.
- Workspace typechecks, lint and test typechecks: 14/14 tasks passed after dependency builds. The initial concurrent lint run started before shared package output existed and failed resolution; the subsequent run passed.
- Test lint passed.
- 60 focused isolated tests passed: 26 admin session, 17 email OTP, 6 email route, 11 notification transport. Route tests require a placeholder `DATABASE_URL` during imports and use mocked database calls. The first frozen route run omitted it; rerunning with a nonconnecting placeholder passed. Real PostgreSQL concurrency is not established by these mocks.
- Independent bounded auth review found no release blockers in role/status checks, account binding, replay prevention, committed failed attempts or phone compatibility; enumeration caveat recorded above.
- Live API health: HTTP 200. Protected admin access: HTTP 401. Admin-origin preflight: HTTP 204 with the exact allowed origin.
- Live `/auth/admin/otp/request` rejects a missing email with HTTP 400 VALIDATION.
- Browser-rendered admin page shows “Admin email address” and “Send sign-in code.”

## Delivery check

Brevo initially rejected outbound IP `152.55.184.255`. After deployment, the new API container reported `152.55.185.89`; the user authorized it and the sender-list request returned HTTP 200. The available active senders are `review@lyba.io` and `noreply@lyba.io`. The default HireQuick sender is not listed. The user selected `noreply@lyba.io` temporarily, displayed as HireQuick, and `BREVO_EMAIL_SENDER` was saved on the API. Unknown-IP protection remains enabled. No delivery or completed sign-in is claimed until provider acceptance and user entry of the code.

Future deployments may change outbound IPs. Railway documents a Pro-plan static outbound IP feature; the installed CLI (4.23) does not expose its management command. No plan upgrade or networking setting was changed.

After the sender-configuration restart, the initial live code request returned HTTP 502 `OTP_DELIVERY_FAILED`. A provider diagnostic confirmed the selected sender but returned HTTP 401 for new outbound IP `152.55.185.15`. The user was asked to authorize this address. No subsequent deployment is needed to retry delivery. The rejected code was invalidated by the delivery-failure path.

The user then confirmed authorization. Retrying the public `/auth/admin/otp/request` endpoint for the configured admin succeeded with HTTP 200 and `{"sent":true}`. No further deployment occurred, and no OTP value was retrieved or exposed. The user can enter the emailed code in the admin console; codes expire after ten minutes.

[Open the admin console](https://hirequick-admin-production.up.railway.app).
