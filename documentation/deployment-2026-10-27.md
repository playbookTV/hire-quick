# Production release — 27 October 2026

The owner asked for all pending work to be committed and deployed. This release ships weekly payout runs, push delivery through Expo (phase 0), the identity name check and the Edit profile fixes. It also keeps the app-store review login that production already ran. The database migrations, API, worker and admin are live. Android build 28 and iOS build 19 finished from the same commit ([mobile builds](#mobile-builds)).

## Source

Commit `6e53a9d` on `feat/weekly-payouts`:

| Commit    | Change                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2948006` | Weekly payout runs with two-admin approval ([decisions](payments/weekly-payouts-decisions-2026-10-23.md))                                                 |
| `28086b5` | Smile ID name check: typed names are compared with the ID record before approval ([Smile ID](../docs/SMILE-ID.md#name-check))                             |
| `5f04e92` | EU shoe sizes, attribute dropdowns, named validation errors, toasts above iOS modal sheets                                                                |
| `2672161` | Push delivery through Expo, phase 0 ([plan](push-notifications-plan-2026-10-27.md), [guide](../docs/PUSH-NOTIFICATIONS.md))                               |
| `6e53a9d` | Merge of `feat/app-review-login` (`4616a9a`). Production had run it since 23 October; without the merge this release would have removed the review login. |

## Checks before deployment

The CI sequence ran locally against a disposable PostgreSQL 18 `hirequick_test` database: install, Prisma generate, docs links, typecheck, lint, test typecheck, test lint, `migrate deploy`, drift guard, then the test suites.

- Shared, admin and mobile tests passed. Typecheck, lint, the docs check, migrations and the drift guard passed.
- API: 1,078 of 1,080 tests passed. The two failures (`live-authorization` message bounds 403 instead of 400, and `flow-reads` include shape) have failed since `6d6c2ea`, which production already ran.
- Under `turbo`, the `auth` and `notifications` suites returned 502 on OTP requests. Turbo passes only `DATABASE_URL`, `DIRECT_URL` and `NODE_ENV`, so the root `.env` Brevo key reached the tests. Rerun directly with Vitest and the test environment, both passed, including the 32 review-login tests.

A read-only production preflight found:

- The API and worker use the same database (`ep-falling-band-adc0yh5i`).
- Exactly two migrations were pending: `20261023120000_weekly_payout_runs` and `20261027120000_expo_push_delivery`.
- The push migration's FCM-token delete matched 0 of 0 device tokens. The payout backfill would give 1 usher a payout account.
- `PAYOUT_MODE` is unset on both services, so withdrawals stay on demand. The review login variables are still set on the API.

## Deployment

The owner ran the release script at about 22:13 UTC (the auto-mode safety check blocked the agent from production writes). It applied the migrations through `railway run` on the API service, confirmed "Database schema is up to date" and no schema drift, then uploaded a clean `git archive` of `6e53a9d` (614 files; the Paystack-key scan matched only test fixtures) with `railway up --path-as-root`.

| Service                   | Deployment                             | Previous                               | Result                                     |
| ------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------ |
| API `prolific-love`       | `ad81ccd4-6131-40f5-9e73-292752616658` | `faa04707-2586-4794-87a7-1b9ec403429d` | Listening 22:15:58 UTC, `env="production"` |
| Worker `hirequick-worker` | `18a6d1d0-ef51-4e39-8170-f282d7565579` | `4d8127b0-7827-460d-8ce7-6d0633ee8166` | "scheduled jobs ready" 22:16:04 UTC        |
| Admin `hirequick-admin`   | `37272be4-81fe-4d9d-a28e-d3aef90e2b07` | `138e7179-72dd-424a-932e-d5fb9e6c654a` | Serving                                    |

All three reported `SUCCESS` by 22:16:21 UTC. The worker previously ran the stored 2 October upload; it now runs repository code too.

## Checks after deployment

- `/health` and `/ready` returned 200. Unauthenticated `/api/me`, `POST /api/me/devices` and `/api/me/notification-preferences` returned 401.
- The new API, worker and admin startup logs held no error-level lines.
- No synthetic sign-ins, payouts, pushes or profile edits were made in production.

## Mobile builds

The first Android build (`5a5d68d9`) was cancelled. Another session had saved uncommitted push changes (`apps/mobile/lib/push.ts`, its test and the push guide) about 30 seconds before it uploaded, and EAS uploads uncommitted files. Both builds were restarted from a temporary detached checkout of `6e53a9d`, so they contain exactly the released commit. That checkout was removed after upload.

| Platform | Profile                       | Build                                                                                                                           | Status                                                                                                       |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Android  | `preview` (internal APK)      | [build 28, `759423c4`](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/759423c4-6343-48dc-8887-da41908c4442) | Finished 22:51 UTC; the APK returned HTTP 200, 173,640,061 bytes                                             |
| iOS      | `ios-archive` (store archive) | [build 17, `2b168922`](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/2b168922-e1e0-41f5-9300-05e427673587) | Failed: the App Store provisioning profile lacked the new capabilities                                       |
| iOS      | `ios-archive` (store archive) | [build 19, `c1e4375a`](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/c1e4375a-0979-4a63-ad0f-a0e5a29dfef8) | Finished 23:08 UTC; the archive returned HTTP 200, 45,960,830 bytes. Uploaded to App Store Connect 23:54 UTC |

At the owner's request, build 19 was submitted to App Store Connect (app `6826389013`) with the EAS-held App Store Connect API key: [submission `578d40c6`](https://expo.dev/accounts/ovalay-studios/projects/hirequick/submissions/578d40c6-efe8-4ba7-a789-41eb7b6369b9), finished 23:54 UTC. Apple then processes the build before it appears in TestFlight; `ITSAppUsesNonExemptEncryption` is `false`, so no export-compliance answer is needed. Processing was not observed from here.

The EAS `preview` environment holds no `GOOGLE_SERVICES_JSON`, so Android devices on this build cannot register for push.

iOS build 17 failed at archive. The App Store provisioning profile (created 25 September) did not include the Push Notifications and Time Sensitive Notifications capabilities, or the `aps-environment` and `time-sensitive` entitlements that `expo-notifications` now adds. A non-interactive build cannot change Apple capabilities. The owner ran an interactive build from a clean detached checkout of `6e53a9d` and signed in to Apple, so EAS could enable the capabilities and make a new profile. Build 19 archived successfully, which confirms the new profile carries the push entitlements. Build number 18 was used by an attempt that never uploaded. This record cannot confirm whether an APNs key was created during that run; check the iOS push key under the project's credentials on expo.dev before testing push.

## Open after this release

- **Thursday 29 October, 08:00 UTC:** the worker builds the first weekly payout run as a draft. Production still holds TEST-era wallet balances and recipient codes. Do not submit or approve the run until they are cleared ([production switch record](deployment-production-mode-2026-10-23.md)). No money moves without two admins and the transfer OTP.
- **Push:** add Firebase's `google-services.json` to EAS, add an APNs key, accept on devices, and add Expo, Google and Apple to the privacy policy's processor list. Until then no push reaches a phone.
- **Name check:** observe the first live Smile callback carrying `user_provided_info` and `id_fields`. Verifications approved before this release were not re-checked, including the tester's invented-name account.
- **Device acceptance** of the Edit profile dropdowns and of toasts above iOS modal sheets.
- `SENTRY_RELEASE` still reads `hq-sentry-20260928`, so Sentry labels this release with the old name.

## Rollback

Earlier code can be restored by redeploying the previous deployments from the Railway dashboard. The migrations are not reversed by that. The previous API registers devices under the old `fcmToken` column, which no longer exists, so its device registration would fail. Payout tables and columns are additive. Prefer a forward fix, and preserve payout runs, withdrawals, verification records and audit history.
