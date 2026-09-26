# Observability deployment — 26 September 2026

API, admin and worker application deployments are **SUCCESS** on Railway. These are new application images, not only environment updates. The Railway environment is named `production`; the backend services retain staging configuration.

| Service | Deployment |
| --- | --- |
| API (`prolific-love`) | `56da2342-9c65-47bb-b34b-06aa6852ce1c` |
| Worker (`hirequick-worker`) | `9e641bbb-e0d4-49af-8609-677ee497979c` |
| Admin (`hirequick-admin`) | `da277167-e4da-4c01-b9c7-6af147dca0a7` |

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

Fresh builds were submitted after Railway deployment succeeded:

- Android preview build 10: [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/ef54e749-8394-44c9-95c9-2c747367cc95).
- iOS preview build 4: [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/624148f2-8653-4455-942e-0f8cd98c0c32).

Both use the preview environment and deployed API origin. Android reuses its existing keystore. iOS reuses the existing distribution certificate and has a new ad hoc profile containing the registered iPhone. These are preview builds, with no store submission. Completion, source-map upload and artifact validation are pending.

## Evidence

[Release manifest](validation-evidence/2026-09-25/observability-release/release-manifest.json) · [Validation](validation-evidence/2026-09-25/observability-release/validation.json) · [Railway status](validation-evidence/2026-09-25/observability-release/railway-status.json) · [API runtime](validation-evidence/2026-09-25/observability-release/prolific-love-runtime.json) · [Worker runtime](validation-evidence/2026-09-25/observability-release/hirequick-worker-runtime.json) · [HTTP checks](validation-evidence/2026-09-25/observability-release/http-checks.json).
