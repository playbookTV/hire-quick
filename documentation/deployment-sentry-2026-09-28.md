# Sentry tracing and readable messages release — 2026-09-28

The user authorized deployment of the performance tracing and message-filter changes. The API, worker and admin are deployed successfully from a frozen source snapshot. Android build 16 and iOS build 10 are finished and available through the existing internal preview distribution.

## Source and targets

- Base repository revision: `09bc93bd7d29d61c6586e7cde9db1052d47b2046`.
- Frozen release snapshot: `de14bb9078dfa13ed8e5cdbd1fa5f4100c4bb6dd`. This is a temporary release checkout containing the base revision plus the reviewed working changes; the user's repository history was not rewritten.
- Backend/admin Sentry release: `hq-sentry-20260928`.
- API deployment: `557d76aa-0dcc-4ea2-8c7f-e4ba7ccae63b` — SUCCESS.
- Worker deployment: `b4c83d93-960c-49a8-8dcc-e8115c7309d6` — SUCCESS.
- Admin deployment: `24f0d4ff-04d8-4cec-bdd0-16c69ef1c120` — SUCCESS.
- [Source hashes and release manifest](validation-evidence/2026-09-28/sentry-release/release-manifest.json).

Railway's environment is named `production`; API and worker retain `NODE_ENV=staging` and Paystack TEST credentials. Existing DSNs remain separate. Both backend services explicitly use `SENTRY_TRACES_SAMPLE_RATE=0.1`. No database migration or business-data mutation was required.

## Verification

The 18 focused API tests and three mobile privacy tests passed. Admin production build and 11 admin tests passed. API, admin and mobile type checks, API test type checks, affected lint and documentation links passed; existing lint warnings remain. The full API suite was not repeated for this release.

Live `/health` and `/ready` returned 200; an unauthenticated admin observability request returned 401. The admin serves `index-B9S1uhRp.js`, matching the local build byte-for-byte, containing the new release label and no blanket privacy placeholder. [HTTP evidence](validation-evidence/2026-09-28/sentry-release/http-checks.json).

SSH read-only checks confirmed deployed API/worker module hashes match the tested build, Node preloads Sentry, the tracing rate is configured, original exception text survives, and request/user fields are removed. [Runtime evidence](validation-evidence/2026-09-28/sentry-release/runtime-checks.json). The deployed worker completed Smile monitoring, checkout recovery and no-show jobs successfully.

One synthetic error and span were sent from each backend in a separate verification process. That process used 100% sampling only for its own lifetime; the services retain 10%. Sentry received readable exception text in `HIREQUICK-API-3` and `HIREQUICK-WORKER-5`; both synthetic issues were resolved after verification. [Smoke IDs](validation-evidence/2026-09-28/sentry-release/sentry-smoke.json).

API and worker synthetic traces are `d8cf45d35b6b44ffbfb72cb653cc2866` and `f4b9a53a354d4037b435152827bfdc14`. Initial health-request span searches returned no results, so delivery was investigated without speculative code changes. A temporary local HTTP server inside the deployed API container recorded three of 30 requests at the configured 10% rate; all three appeared in Sentry. A real API request trace subsequently confirmed the running application's delivery: `185eb1b23cf7442db74dbfae07cf6da0`. No tracing repair was required; the absence of health-request results alone is not treated as evidence of delivery failure. Naturally sampled worker-job spans were not yet observed; worker span ingestion is confirmed by the synthetic trace and job behavior by tests and live completion logs.

## Mobile

- [Android preview build 16](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/7bbc7be7-74f9-473f-8a7c-77ac46d2f8c4): FINISHED.
- [iOS preview build 10](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/4a583e40-e1b9-4894-bd68-3047a315d030): FINISHED.
- [Mobile build evidence and installable artifacts](validation-evidence/2026-09-28/sentry-release/mobile-builds.json).

These are Android APK and iOS ad hoc releases using existing credentials and registered devices. They require installation to change reporting in an existing mobile app. No app-store submission, OTA publication or installed-device acceptance test was performed.

## Limits and rollback

Previously redacted Sentry events remain unchanged. The new filters preserve captured error text, including anything the caller embeds in that text; request/user/context filtering remains active. Reporters that intentionally send fixed diagnostic codes continue to do so.

No customer login, paid notification, identity decision, financial transaction or ledger mutation was used for verification. This release does not claim to resolve the earlier Smile review, stalled verification, reconciliation or audit-chain issues. Roll back API and worker together to their preceding deployments if necessary; this release introduced no schema change. Setting the tracing rate to zero disables performance collection while retaining errors.
