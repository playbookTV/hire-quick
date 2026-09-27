# Observability deployment — 26 September 2026

API, admin and worker application deployments are **SUCCESS** on Railway. These are new application images, not only environment updates. The Railway environment is named `production`; the backend services retain staging configuration.

| Service | Deployment |
| --- | --- |
| API (`prolific-love`) | `6693f714-0a33-481a-9ad2-ae36f585cf60` |
| Worker (`hirequick-worker`) | `9e641bbb-e0d4-49af-8609-677ee497979c` |
| Admin (`hirequick-admin`) | `da277167-e4da-4c01-b9c7-6af147dca0a7` |

The initial API deployment was `56da2342-9c65-47bb-b34b-06aa6852ce1c`. A subsequent [admin-login networking fix](admin-login-networking-2026-09-26.md) activated static outbound IPs with the same application image; the latest API deployment above is also successful.

[Open admin observability](https://hirequick-admin-production.up.railway.app/observability).

The frozen source is `/private/tmp/hq-observability-release-20260925T223233Z`, release label `hq-20260925T223233Z`. Its 474-file manifest includes current API/admin/mobile/shared code, excludes the unrelated website and local secrets, and was verified before upload. No workspace commit, push, reset, seed or hosted database migration was performed. The existing database migrations are already current.

## Runtime verification

Both backend containers report the expected deployment IDs, the expected source hashes, PostgreSQL connectivity and Redis PONG. `/health` and `/ready` return 200. The admin's JavaScript and CSS match the release byte for byte. The admin monitoring endpoint returns 401 without authentication; 18 focused release tests cover the authenticated role gates and collector behavior.

Synthetic informational events from both deployed containers were received in Sentry and their dedicated smoke issues were resolved. No customer data was sent. The deployed monitoring collector reports the API, database and Redis up; Sentry is connected for `react-native`, `hirequick-api`, and `hirequick-worker`. Better Stack's four HireQuick monitors are enabled, and a genuine checkout-recovery heartbeat was received. Reconciliation and audit monitoring await their scheduled daily runs. Email delivery to `hguilliman@gmail.com` remains unverified, and the resource-level notification flags remain disabled. Monitoring does not certify every financial operation or provider's availability.

The user explicitly approved copying `BETTER_STACK_API_TOKEN` and `SENTRY_READ_TOKEN` into the Railway API service. Both were saved through stdin and verified without disclosure. Separate public Sentry DSNs were configured for the API and worker; upload credentials remain separate from read credentials.

## Validation and limitations

Workspace builds, application/test typechecks and lint passed (one existing regex warning). Shared tests: 62 passed. Mobile privacy tests: 2 passed. Provider lifecycle/recovery validation: 50 passed. The exact deployed snapshot's focused observability/admin tests: 18 passed.

The full API suite is **not green**: 871 passed, 22 failed, one skipped across 94 suites. Failures include remote database timeouts/connection loss, mocked Prisma state, OTP/notification assertions, callback logger counts, a cancellation response expectation and a retention spy assertion. These remain follow-up work; successful deployment and health checks do not resolve them. The disposable test schema was removed and verified. No claim is made that every workflow passes the full regression suite.

## Mobile previews

Initial Android build 10 failed because the Sentry upload executable was not available at the app-local path expected by Gradle. Initial iOS build 4 failed with duplicate Sentry native symbols from CocoaPods and Smile ID's Swift package dependency. Neither failed build is an installable release.

Corrections are saved in the working tree and a new frozen mobile snapshot, `/private/tmp/hq-native-monitoring-fix-20260926`:

- `@sentry/cli` 2.58.4 is a direct mobile development dependency.
- A local Swift package retains Smile ID's exact verified Bridge/Vision Face binaries and Kamera dependency, omitting only its optional Sentry adapter. The config plugin replaces the package reference in both native projects after pod installation.
- Smile ID's documented `enableCrashReporting` option is false because HireQuick owns Sentry and its privacy filter.

Mobile typecheck/lint, Swift manifest validation, native project generation and the Ruby hook's idempotent app/Pods reference conversion passed. All 477 archive files match the mobile manifest; generated iOS projects and private files are excluded.

Completed replacement preview builds (both **FINISHED**):

- Android build 11: [Download APK](https://expo.dev/artifacts/eas/CljW5KYdclYsc8SwfFxJK-mxSxrgsliY1C91T5je3-E.apk) · [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/2f3be311-4fa6-4b17-a9f4-e8bcb7a677d0).
- iOS build 5: [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/32e27886-fc67-4e66-98e6-e7146384f053).

Both use the preview environment and deployed API origin. Android reuses its existing keystore. iOS reuses the existing distribution certificate and has an ad hoc profile containing the registered iPhone. No store submission was performed. Both downloaded archives passed integrity and embedded-configuration checks. Android's signer certificate matches the previous preview. The iOS profile signature and registered-device inclusion were verified. Both bundles contain the deployed API origin and expected Sentry project, with native Sentry present. No checked private local credentials were found in either JavaScript bundle.

EAS logs confirm source-map uploads for `com.hirequick.mobile@0.0.1+11` and `com.ovalay.hirequick@0.0.1+5`; iOS also uploaded 34 debug information files. An installed-device crash/stack-resolution test has not been performed.

## Evidence

[Release manifest](validation-evidence/2026-09-25/observability-release/release-manifest.json) · [Validation](validation-evidence/2026-09-25/observability-release/validation.json) · [Railway status](validation-evidence/2026-09-25/observability-release/railway-status.json) · [API runtime](validation-evidence/2026-09-25/observability-release/prolific-love-runtime.json) · [Worker runtime](validation-evidence/2026-09-25/observability-release/hirequick-worker-runtime.json) · [HTTP checks](validation-evidence/2026-09-25/observability-release/http-checks.json).

Mobile evidence: [Android artifact](validation-evidence/2026-09-25/observability-release/android-artifact.json) · [iOS artifact](validation-evidence/2026-09-25/observability-release/ios-artifact.json) · [Sentry uploads](validation-evidence/2026-09-25/observability-release/mobile-sentry-uploads.json) · [Native validation](validation-evidence/2026-09-25/observability-release/mobile-fix-validation.json).
