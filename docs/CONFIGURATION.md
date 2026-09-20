# Configuration reference

[Documentation index](README.md) · [Local setup](GETTING_STARTED.md) · [Deployment](DEPLOYMENT.md)

Source: [API environment schema](../apps/api/src/env.ts), [server wiring](../apps/api/src/server.ts), [root example](../.env.example). Defaults below apply when a variable is **absent**; an explicitly empty value can behave differently. Export the trusted root `.env` before filtered API/Prisma commands as shown in Local setup. CI and containers use injected environment values. API tests explicitly load root `.env` unless variables are already exported.

## Runtime and database

| Variable       | Default                  | Usage                                                                                   |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `development`            | `development`, `test`, `staging`, `production`. Use `test` only for isolated tests.     |
| `PORT`         | `4000`                   | Positive HTTP port.                                                                     |
| `TRUST_PROXY`  | `0`                      | Number of trusted proxy hops; match the actual topology.                                |
| `LOG_LEVEL`    | `info`                   | Pino log level; example file uses `debug`.                                              |
| `DATABASE_URL` | Required                 | PostgreSQL runtime URL; pooled connection supported. Secret.                            |
| `DIRECT_URL`   | Optional to API parser   | Required by Prisma datasource/migration workflows; direct PostgreSQL endpoint. Secret.  |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Normal API and worker need reachable Redis. Empty is not an offline-server switch.      |
| `CORS_ORIGINS` | Empty list               | Comma-separated exact browser origins. Production `createApp` requires a nonempty list. |
| `PROCESS_TYPE` | Not read by API schema   | Container entrypoint selects worker only for `worker`; otherwise starts API.            |

Do not infer service readiness from successful environment parsing or `/health`.

## Authentication

| Variable                       | Default              | Usage                                                                    |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------ |
| `JWT_ACCESS_SECRET`            | `dev-access-secret`  | Access signing secret. Explicit empty string fails validation.           |
| `JWT_REFRESH_SECRET`           | `dev-refresh-secret` | Refresh signing secret; use a distinct secret.                           |
| `JWT_ACCESS_TTL`               | `900`                | Positive seconds.                                                        |
| `JWT_REFRESH_TTL`              | `2592000`            | Positive seconds (30 days).                                              |
| `OTP_VERIFIER_SECRET`          | Empty                | OTP verification secret; empty in dev/test uses a process-ephemeral key. |
| `OTP_VERIFIER_KEY_ID`          | `v1`                 | 1–32 alphanumeric, underscore, or hyphen characters.                     |
| `OTP_VERIFIER_PREVIOUS_SECRET` | Empty                | Optional previous key during rotation.                                   |
| `OTP_VERIFIER_PREVIOUS_KEY_ID` | Empty                | Must accompany previous secret and differ from current ID.               |

Staging/production require all three current secrets to be at least 32 characters and not start with `dev-`. Any supplied OTP secret, including the previous one, must meet that strength rule. All processes verifying the same codes need compatible keys. Follow the [OTP rotation procedure](../documentation/otp-verifiers.md); restarting with an ephemeral key invalidates prior codes.

## Payments

| Variable                       | Default | Usage                                                                                                                       |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`          | Empty   | Real HTTP provider key. Use TEST credentials outside authorized live operation.                                             |
| `PAYSTACK_WEBHOOK_SECRET`      | Empty   | Webhook verification secret. Server falls back to payment key in development; staging/production require an explicit value. |
| `PAYSTACK_OPERATING_RECIPIENT` | Empty   | Transfer recipient for commission sweeps; job skips when absent.                                                            |
| `WITHDRAWAL_REQUIRE_BVN`       | `false` | Only exact string `true` enables the additional BVN gate. Does not implement a missing BVN provider check.                  |

Amounts remain integer kobo. Never place server payment keys in mobile or admin public variables. A nonempty key passing validation is not proof of provider authorization or correct merchant configuration.

## OTP and notifications

| Variable                         | Default     | Usage                                                                      |
| -------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `BREVO_API_KEY`                  | Empty       | Delivery API credential; required in staging/production.                   |
| `BREVO_SMS_SENDER`               | `HireQuick` | Configured SMS sender identity.                                            |
| `BREVO_WHATSAPP_SENDER`          | Empty       | WhatsApp business sender.                                                  |
| `BREVO_WHATSAPP_OTP_TEMPLATE_ID` | `0`         | Nonnegative template ID; positive ID plus sender selects WhatsApp.         |
| `BREVO_WHATSAPP_OTP_PARAM`       | `code`      | Approved template variable name.                                           |
| `FCM_PROJECT_ID`                 | Empty       | Firebase project; all three FCM variables enable provider delivery.        |
| `FCM_CLIENT_EMAIL`               | Empty       | Service-account email.                                                     |
| `FCM_PRIVATE_KEY`                | Empty       | Service-account private key; preserve multiline content in secret storage. |

OTP selects WhatsApp when configured, otherwise SMS. Do not assume automatic SMS failover after a selected WhatsApp request fails. `devCode` is returned only with `NODE_ENV=test`. A stubbed notification path does not make interactive development login work offline.

## Verification and storage

| Variable             | Default     | Usage                                                        |
| -------------------- | ----------- | ------------------------------------------------------------ |
| `DOJAH_APP_ID`       | Empty       | Server-side biometric KYC configuration.                     |
| `DOJAH_SECRET_KEY`   | Empty       | Provider secret.                                             |
| `DOJAH_WIDGET_ID`    | Empty       | EasyOnboard widget flow.                                     |
| `DOJAH_ENVIRONMENT`  | `sandbox`   | `sandbox` or `production`; choose explicitly for deployment. |
| `STORAGE_ENDPOINT`   | Empty       | S3-compatible endpoint; empty uses AWS default.              |
| `STORAGE_REGION`     | `us-east-1` | Root example uses `auto` for R2.                             |
| `STORAGE_BUCKET`     | Empty       | Private document/photo/media bucket.                         |
| `STORAGE_ACCESS_KEY` | Empty       | Server storage credential.                                   |
| `STORAGE_SECRET_KEY` | Empty       | Server storage credential.                                   |

Staging/production require all three Dojah values and storage bucket/access/secret values. Endpoint/region must match the provider. CORS on an object store is separate from API CORS and must permit the intended upload clients. Missing storage returns `503 STORAGE_UNAVAILABLE` on upload-url routes.

## Retention

| Variable                      | Default days | Target                                                                                  |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `RETENTION_OTP_DAYS`          | `30`         | Old consumed/expired codes                                                              |
| `RETENTION_DEVICE_TOKEN_DAYS` | `180`        | Stale push registrations                                                                |
| `RETENTION_KYC_VERIFIED_DAYS` | `90`         | Reviewed approved document references/objects                                           |
| `RETENTION_KYC_REJECTED_DAYS` | `30`         | Reviewed rejected document references/objects                                           |
| `RETENTION_CHAT_DAYS`         | `180`        | Old booking messages/media, with the job's additional four-day event-date safety margin |

All are positive integers. The worker also removes expired refresh denylist entries. Financial ledgers are outside this purge. Object deletion is best effort; successful DB cleanup does not prove deletion from object storage. See [Security](SECURITY.md).

## Client build variables

| Variable                       | Scope            | Usage                                                                                                            |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`                 | Admin build/dev  | API base URL; current code/container fallback is a deployed Railway endpoint. Set explicitly.                    |
| `EXPO_PUBLIC_API_URL`          | Mobile build/dev | API base URL; runtime fallback is `http://localhost:4000`. Preview EAS profile overrides it with a deployed URL. |
| `EXPO_PUBLIC_SUPPORT_WHATSAPP` | Mobile           | Support number in E.164 digits; no plus sign needed.                                                             |
| `EXPO_PUBLIC_SUPPORT_EMAIL`    | Mobile           | Fallback support address.                                                                                        |

These are public bundle contents, not secret stores. See [mobile example](../apps/mobile/.env.example), [mobile config](../apps/mobile/lib/env.ts), [EAS profiles](../apps/mobile/eas.json), and [admin client](../apps/admin/src/lib/api.ts). Changing a deployed runtime variable does not rewrite an already built client bundle.

### Temporary manual verification for client testing

`KYC_MODE=manual` permits staging to start without Dojah credentials. Biometric
sessions return `KYC_UNAVAILABLE`, and Dojah callbacks cannot approve identities.
Document uploads and authorized admin review remain required. All payment, storage,
and authentication checks remain enabled. The default is `KYC_MODE=dojah`;
`NODE_ENV=production` rejects manual testing mode. Restore `KYC_MODE=dojah` and
configure all three Dojah credentials before enabling biometric verification.

### Admin email sign-in

The admin console uses `/auth/admin/otp/request` and `/auth/admin/otp/verify`
with an email address. Only a pre-existing ACTIVE ADMIN account can receive a
code or authenticate; these endpoints never register accounts or grant roles.
Email codes expire after ten minutes, allow at most five failed attempts, and
are issued at most five times per hour per admin email. Codes are bound to the
normalized email and user ID, and are separate from phone OTPs.

Set `BREVO_EMAIL_SENDER` to a verified sender in the configured Brevo account
(default `no-reply@hirequick.app`). Brevo must authorize the API service's
outbound IP. A provider rejection reports a delivery failure and invalidates
that issuance; provider acceptance alone does not prove inbox delivery. Mobile
phone login remains available through its existing endpoints.
