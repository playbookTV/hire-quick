# Full deployment — 2026-09-28

Source revision: `56a9d041ccd2f0d88a8a22aafaaf2fea90f4e00f`.

The user authorized deployment of all applications. API, worker and admin were uploaded from the same clean Git archive. The website was built from the same revision and published to the existing Vercel production project. Mobile uses the existing Expo internal preview distribution for Android and iOS; no app-store submission or OTA update was made.

## Targets and evidence

- API: https://prolific-love-production-2775.up.railway.app
- Admin: https://hirequick-admin-production.up.railway.app
- Website: https://hirequick.agency
- [Release manifest](validation-evidence/2026-09-28/full-release/release-manifest.json)
- [Live HTTP checks](validation-evidence/2026-09-28/full-release/http-checks.json)

Railway's environment is named `production`, while the configured application mode remains `staging` with Paystack TEST credentials. Deployment did not enable live payments or alter identity-provider configuration.

## Database

The preflight found one pending migration, `20260926130000_client_paid_platform_fee`. Prisma migrate deploy applied its additive nullable `bookings.staffPay` column successfully. Existing records and prices were preserved. No destructive schema operation or customer-data rewrite was performed.

## Verification

The review passed 84 affected API tests, 80 shared tests and 11 admin tests. Release checks additionally passed 53 mobile tests and 50 payment lifecycle/recovery tests. App/test type checks, workspace lint, test lint, admin production build, website production build and documentation links passed (lint retained existing warnings). The expanded serial API suite was interrupted by host sleep and was stopped cleanly; it is not claimed to have passed. Its single observed checkout-recovery timeout passed unchanged in a fresh isolated rerun (38.08 seconds). Both test schemas were removed. See the [timeout investigation](validation-evidence/2026-09-28/full-release/test-timeout-investigation.md).

Live `/health` and `/ready` both returned 200. An unauthenticated admin request returned 401; the admin CORS preflight returned 204 and the expected allow-origin. The admin email sign-in form rendered in a browser. The worker registered schedules and completed resumeOps, autocomplete and Smile monitoring jobs.

## Existing operational issues and limits

The legacy `hirequick-jobs` queue still contains a repeating `transferRetry` task that fails as an unknown job. Read-only inspection confirmed the same failures before deployment. The current `resumeOps` job succeeds. No legacy jobs were deleted or replayed.

The API and worker retain the existing Sentry release label `hq-smile-monitoring-20260927`; use the manifest's deployment IDs and source revision to identify this rollout.

No authenticated customer session, paid OTP delivery, live-money transaction or installed-device acceptance test was performed. iOS uses existing ad hoc device registration; the builds are not public store releases. No database restore was performed; backup restoration was not exercised during this additive release.

## Final mobile results

- [Android preview build 15](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/28afd897-63af-4314-abf3-3e9b4acda06d): FINISHED.
- [iOS preview build 9](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/c7ad29f7-6175-41a2-bf2a-40f0588a4462): FINISHED.

Both builds identify the source revision above. Installable artifact URLs are saved in the release manifest.
