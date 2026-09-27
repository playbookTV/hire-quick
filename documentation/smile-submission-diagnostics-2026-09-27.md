# Immediate Smile submission diagnostics

Status: implemented, tested, and released in completed Android 14 / iOS 8 previews. Both packages were downloaded and verified. The original device failure still needs a fresh reproduction.

This corrects the confirmed monitoring gap documented in [the submission investigation](smile-submission-diagnosis-2026-09-27.md). It does not claim to fix the still-unidentified device submission failure.

## Behavior

The mobile flow registers a supported Smile Axios response interceptor after the SDK's token-refresh handler. Rejected submissions now emit `SMILE_CAPTURE_FAILED` immediately, before the user presses Retry or Exit. A successful token refresh produces no failure event. The response observer also detects missing required submission-response fields (`job_id`/`jobId`, `user_id`/`userId`, `status`, `message`) and reports `NETWORK_PARSE_ERROR` with the HTTP status while returning the original response for Smile to handle normally.

Only the fixed diagnostic code, fixed provider/stage, random attempt reference, allowlisted `sdk_error`, and a validated three-digit `http_status` are retained. Request/response bodies, raw errors, headers, tokens, identity details, photos and user IDs are not sent. The SDK's terminal result callback remains a fallback for errors outside the HTTP boundary. Pre-request flow assembly errors still use that terminal callback; this change does not add unsupported SDK hooks.

Deduplication includes error code and HTTP status, allowing a changed failure on retry to remain visible. Repeated identical diagnostics are suppressed for 15 minutes per client process. Reporting failures do not replace the original network result. No retries, verification decisions, token policy, credentials, callback configuration, or server deployments are changed.

## Validation

- A regression test failed against build 13's integration because no immediate interceptor was registered; it passes with this change and verifies failure reporting before the Exit callback.
- Mobile tests: 15 passed, including real Axios rejection/response identity, actual installed Smile token-refresh recovery, malformed 2xx detection, telemetry failure isolation, builder wiring and final event privacy.
- Shared diagnostics: 5 passed, including closed-code/status validation and deduplication that retains different retry failures.
- Mobile typecheck and shared lint passed. Mobile lint passed with two existing warnings in the native Sentry build plugin.
- Exact release snapshot mobile tests (15) and typecheck passed. Its 494 source files were scanned against 12 local private values; no matches.

The release is isolated at `/private/tmp/hq-smile-diagnostics-20260927`, based on the successful Android 13/iOS 7 snapshot. Only seven diagnostics implementation/test files differ. Dependencies, signing configuration, API destination and verification behavior are preserved. Unreleased workspace changes are excluded. Evidence is in `validation-evidence/2026-09-27/smile-submission-diagnostics/`.

## Completed previews

- [Android 14 build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/dddf008c-bf2d-4b4e-8319-25e546484c25) · [installable APK](https://expo.dev/artifacts/eas/FSikSsosNrfNFvclEVvFQHNBJGkMChoZ5uNTbzUuekw.apk).
- [iOS 8 build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/b2a3a360-0fdf-4078-b94e-f1deaaed9d4d) · [IPA](https://expo.dev/artifacts/eas/RK7bvC9vUy8wkyjmdhFnFlnLr31YAkGedn2NaSYWqg0.ipa).

Both packages passed ZIP integrity, embedded immediate-diagnostic/API-origin/Sentry-project checks, and scans against 12 known private values. Android's signing certificate matches the existing release; iOS's embedded build number is 8 and its ad-hoc profile includes the registered iPhone. Both source-map uploads were verified; iOS uploaded five missing debug-information files. Android native-symbol upload is not separately verified.

SHA-256: Android `88f62ec1e2484b73943b0bcc865c0236776bd9f101b14edd88dbca7fff930f5e`; iOS `47cab5f33245b4e03199543b3000a2d28adeca70934fbec07a245f9d2569dec1`.

## Device verification still required

After installing the new preview, reproduce the submission once. A diagnostic should appear without pressing Exit, with `provider:smile_id`, `code:SMILE_CAPTURE_FAILED`, `sdk_error`, `http_status` where a response exists, and the attempt reference. Use that event to distinguish authorization/access/endpoint failures from SDK response parsing. Do not disable device-integrity protections or change provider credentials based only on the generic screenshot.
