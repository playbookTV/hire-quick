# Smile ID monitoring — 27 September 2026

Smile failure reporting is implemented across the API, mobile app and admin console, with a scheduled check for long-pending attempts. API, admin and worker application deployments are **SUCCESS** on Railway, with final runtime and deployed-asset checks passed. Android 13 and iOS 7 preview builds are **FINISHED**, downloaded and verified. Install these previews to enable the new mobile reporting.

The release source is `/private/tmp/hq-smile-monitoring-callback-20260927` (backend/admin); the native builds use `/private/tmp/hq-smile-monitoring-isolated-20260927`. Its API/admin baseline is the verified identity-review deployment; mobile starts from the successful Android 11/iOS 5 source. Only monitoring changes are overlaid. The unreleased client-paid-fee migration, payment-policy changes, unrelated mobile design updates and Crisp integration are excluded. No hosted schema migration is required. The first Android 12/iOS 6 submissions were canceled before distribution because their source included unrelated workspace changes.

## Behavior and privacy

Diagnostics use fixed codes and stages, with a random attempt reference for correlation. SDK capture failure and token-refresh failure now report explicitly. Backend token/result/evidence failures report with a specific code instead of a generic server error. Authenticated provider errors, attention and rejected results are visible; rejection is informational. Cancellation and expected mobile input/attempt-limit errors are not reported as faults.

The new `hirequick-admin` Sentry project captures browser/render errors and handled evidence/review failures. The dashboard feed includes this project alongside `react-native`, `hirequick-api`, and `hirequick-worker`. Its Smile section displays recent latest-attempt counts, long-pending attempts, missing callbacks, provider errors/attention and rejections.

The worker checks every five minutes for latest Smile attempts that are pending over one hour and started within seven days. This is a warning, not proof of provider failure; it can include abandoned captures. All monitoring is read-only with respect to verification outcomes. Duplicate code/reference events are bounded and throttled for 15 minutes per process/client. Identity values, names, images, raw provider bodies, tokens and callback secrets are not sent to Sentry.

## Validation

- Workspace focused verification/database suites: 42 tests passed; tracked migrations, zero schema drift and disposable-schema cleanup passed.
- Exact isolated release: 33 focused verification, monitoring and access-control tests passed; deployed-baseline migrations, zero drift and disposable-schema cleanup passed.
- Focused telemetry/worker tests: 19 passed, including real disposable Redis scheduling/shutdown and Sentry transport capture.
- Shared diagnostic/privacy tests: 3 passed. Mobile privacy/native-builder callback tests: 5 passed.
- Exact-release API/admin builds, mobile typecheck and API test typecheck passed; API/admin lint passed with the existing environment-regex warning.
- Browser interaction checks passed at 1280px and 390px: counts, refresh, unavailable/recovery state and handled evidence failure. The browser emitted a Sentry request with the safe diagnostic/reference and no raw error or applicant data. Every remote request was intercepted; no real records or messages were changed.
- Final callback-boundary classification: 4 focused transport/HTTP tests passed, plus API build/test typecheck and API/admin lint. The wrapper preserves more specific provider-stage errors and does not change HTTP outcomes. Final dashboard spacing was rechecked in the browser.
- 492 source files scanned against local secrets: no matches. No full API regression rerun or on-device real biometric capture is claimed.
- Both native packages passed ZIP integrity, embedded monitoring/API-origin checks and private-key scanning. Android's signing certificate matches the previous release; iOS provisioning includes the registered iPhone and its embedded build number is 7. Both builds uploaded source maps to Sentry; iOS also uploaded five missing debug-information files. Android native-symbol upload is not separately verified.

## Deployment

API: `a7a398df-19d8-4c0b-b707-10ba82599313`.
Admin: `6cc9bc08-5624-4e7e-974c-4b2547b649ca`.
Worker: `834ac495-5c97-419a-a2ce-3eecdfb93957`.

Completed mobile preview builds: [Android 13](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/0bdf6dd0-29f3-4907-9bb3-18465d2beb48), [iOS 7](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/7eb98766-c1dc-4034-b689-2c03aa1643b7).

Direct artifacts: [Android APK](https://expo.dev/artifacts/eas/QrA9W7QewRu5Xqz-FgCY1wGqyJmoSyMrCUeCZf-B3K4.apk), [iOS IPA](https://expo.dev/artifacts/eas/1hFwBD92WiUUWyIvbQxI431re9GvfbUOkI0WuLA9580.ipa).

SHA-256: Android `61f0a4b952fe3dbe9b03854fa4ddcab4e4fd8559d2fd05003a8127c493d7a74b`; iOS `7d425ecefd06a8ca98638d3c505500ab648dc7ad76219e3cf20a30010d8ce99b`.

[Open observability](https://hirequick-admin-production.up.railway.app/observability) · [Smile diagnostics](https://studio-templar.sentry.io/issues/?query=provider%3Asmile_id&statsPeriod=7d).

Evidence: [manifest](validation-evidence/2026-09-27/smile-monitoring/release-manifest.json), [browser checks](validation-evidence/2026-09-27/smile-monitoring/browser-checks.json), [secret scan](validation-evidence/2026-09-27/smile-monitoring/source-secret-scan.json).

## Live checks and limits

The running release matches expected source hashes. API/database/Redis are up, Smile remains in production mode, all four Sentry projects are readable, and the Smile worker schedule is registered with completed runs and zero failed jobs. Public health/readiness return 200, unauthenticated observability returns 401, and deployed admin assets match the release build. The initial live count was zero pending and two rejected latest attempts. The admin ingestion endpoint accepted the informational setup event, Sentry returned it as `HIREQUICK-ADMIN-1`, and that setup issue was resolved. This is an ingestion check, not a real applicant capture.

The admin browser SDK is enabled, but admin source-map upload has not been verified. Fixed Smile diagnostic codes remain readable; general browser stack traces may be minified. Real-device capture and callback delivery still need an on-device check after installing the new preview.

Existing Better Stack reconciliation and audit checks reported down during the live read. These are separate operational findings; this rollout does not repair financial reconciliation or the previously documented historical audit-chain mismatch. Existing notification routing limitations also remain.
