# Observability

[Documentation index](README.md) · [Operations](OPERATIONS.md) · [Configuration](CONFIGURATION.md)

HireQuick uses Sentry for API/worker errors, Better Stack for uptime and scheduled-job heartbeats, and JSON logs for request/job timing. This follows TRD §17. The integrations are opt-in; adding code does **not** create hosted projects, notification rules, or a deployment.

## What is instrumented

| Signal | Behavior |
| --- | --- |
| HTTP requests | One JSON entry per request, with `reqId`, route template, method, status, duration in milliseconds, and aborted status. 4xx are warnings; 5xx and aborted requests are errors. |
| Request correlation | `x-request-id` is returned even for rate-limited/parser/error responses. Valid UUID request IDs are retained; other input is replaced with a UUID. |
| API failures | Unexpected errors and explicit 5xx `ApiError`s reach Sentry. Validation errors do not. The public error envelope is unchanged. |
| Fatal process errors | API and worker report uncaught exceptions/unhandled rejections, flush for up to two seconds, and exit unsuccessfully so the process manager can restart them. |
| Jobs | Every scheduled handler reports duration and outcome. Exceptions retain their original identity and retry behavior. Queue/runtime connection errors are reported too. |
| Financial alarms | Failed balance collection, reconciliation requiring review, and broken audit chains create distinct Sentry issues. Reconciliation/audit alarms send failed heartbeats even if the job itself completed. |
| `/health` | HTTP liveness only: `200 {"status":"ok"}`. No dependency probes. |
| `/ready` | A database `SELECT 1` and Redis `PING` must both succeed. Returns `200 {"status":"ready"}` or `503 {"status":"unavailable"}`, without connection details. Two-second response deadline; five-second caching and shared in-flight checks limit probe load. |

The checks do not certify payment provider availability, ledger correctness, or all worker queues. Reconciliation and job monitoring supply separate signals. A checkout heartbeat proves that handler is completing, not that every other queue is healthy.

## Connect Sentry

1. Create Node.js projects named `hirequick-api` and `hirequick-worker`. Choose the appropriate organization/data region for your data handling policy.
2. In each Railway service's private environment variables, set `SENTRY_DSN` to that project's DSN. Set `SENTRY_RELEASE` to the deployed Git revision in both services. Set the correct `NODE_ENV` (`staging` or `production`). The worker launch commands set `PROCESS_TYPE=worker`.
3. Configure issue alerts for new/regressed errors. Add explicit high-priority rules matching the `code` tags `RECONCILIATION_ERROR`, `RECONCILIATION_REVIEW`, and `AUDIT_CHAIN_BROKEN`. Route these to your selected operator/on-call destination. Creating a project alone does not enable paging.
4. Deploy the prepared revision, then run a synthetic smoke event in **staging**, from the API package directory:

   ```sh
   node --input-type=module -e "await import('./dist/observability/init.js'); const { reportError, flushMonitoring } = await import('./dist/observability/reporting.js'); reportError(new Error('Synthetic observability check'), { code: 'OBSERVABILITY_SMOKE' }); await flushMonitoring();"
   ```

5. Confirm the event appears with the correct service, environment, release, and `OBSERVABILITY_SMOKE` tag. Confirm alert routing and resolve the synthetic issue. An SDK flush alone is not proof the project received the event.

Source locations initially reference the deployed JavaScript. For TypeScript stack traces, upload that exact build's source maps to the matching Sentry project/release before deployment, using [Sentry's source-map workflow](https://docs.sentry.io/platforms/javascript/guides/node/sourcemaps/). Keep upload auth tokens in build secrets. Do not expose them to clients or commit them.

## Connect Better Stack

### Hosted setup status — 26 September 2026

The API, admin and worker application releases are deployed successfully to Railway. Both backend services retain `NODE_ENV=staging` in Railway's environment named `production`. `/health` and `/ready` return HTTP 200. PostgreSQL and Redis probes pass in both containers, and selected deployed source hashes match the frozen release.

| Resource | ID | Configuration | Activation check |
| --- | --- | --- | --- |
| HireQuick API readiness | `4981049` | `/ready`, HTTP 200, 60-second checks, 60-second confirmation and recovery | Monitoring enabled |
| HireQuick checkout recovery | `497964` | 5-minute period, 10-minute grace | Genuine worker heartbeat received; up |
| HireQuick financial reconciliation | `497965` | 24-hour period, 60-minute grace | Enabled; awaiting scheduled run |
| HireQuick audit verification | `497966` | 24-hour period, 60-minute grace | Enabled; awaiting scheduled run |

The three secret heartbeat URLs are loaded by the deployed worker. No fabricated heartbeat was sent. Sentry projects `hirequick-api` and `hirequick-worker` were created under `studio-templar` and configured with their separate DSNs and release `hq-20260925T223233Z`.

The requested alert recipient is `hguilliman@gmail.com`. External recipient setup remains unverified through **Uptime → Integrations → Exporting data → Outgoing e-mails**. Use incident-started/resolved notifications and **Notify alongside the primary responder**; restrict to HireQuick resources if available. Resource-level email/call/SMS/push flags remain false. Monitoring is active, but delivery to the requested email address is not yet verified.

See the [deployment record](../documentation/deployment-observability-2026-09-26.md) and [runtime evidence](../documentation/validation-evidence/2026-09-25/observability-release/prolific-love-runtime.json). Earlier paused configuration evidence is retained as historical setup evidence.

### Monitor configuration

Create an HTTPS uptime monitor for the deployed API's `/ready` endpoint, requiring HTTP 200, at a 60-second interval if your plan supports it. A reasonable initial paging threshold is two consecutive failures. Keep Railway's restart/liveness check on `/health`; restarting every replica during a shared database outage will not fix the database.

Create these three **separate** [heartbeat monitors](https://betterstack.com/docs/uptime/cron-and-heartbeat-monitor/) and configure their notification destination:

| Heartbeat | Expected interval | Initial grace | Worker environment variable |
| --- | --- | --- | --- |
| Checkout recovery | 5 minutes | 10 minutes | `BETTER_STACK_CHECKOUTS_HEARTBEAT_URL` |
| Reconciliation | 24 hours | 60 minutes | `BETTER_STACK_RECONCILIATION_HEARTBEAT_URL` |
| Audit verification | 24 hours | 60 minutes | `BETTER_STACK_AUDIT_HEARTBEAT_URL` |

Copy each secret heartbeat URL into its environment variable. Only URLs under `https://uptime.betterstack.com/api/v1/heartbeat/` are accepted. Leave variables blank to disable delivery. Heartbeats start monitoring after the **first** received ping; explicitly verify activation after deployment. Schedules use UTC: reconciliation is at 03:17, audit verification at 02:47, and checkout recovery at minutes 02, 07, 12, and so on.

Successful checks POST to the heartbeat URL; failures POST to its `/fail` endpoint. Delivery has a two-second deadline, sends no payload, and does not follow redirects. Delivery failures produce a local `HEARTBEAT_DELIVERY_FAILED` warning but cannot turn a successful business operation into a retry. A failed ping can still be recovered by the next successful scheduled check; retained Sentry issues and reconciliation history provide the incident record.

Test missed-heartbeat detection with a temporary staging monitor. Do not stop the production payment worker to test notifications. Check both incident opening and recovery with the intended operator.

## Logs and initial dashboards

### Admin observability view

The admin console has an **Observability** navigation item at `/observability`, also linked from the overview. It reads `GET /api/admin/observability`, protected by the existing active-account check and ADMIN role gate. The endpoint returns `Cache-Control: no-store`; its backend collection is cached for 30 seconds per API process and concurrent refreshes share one collection. The page refreshes every 30 seconds while visible, supports manual refresh and disabling automatic refresh, and marks retained data stale after a failed refresh or 90 seconds.

The page shows the responding API instance, a bounded database probe and Redis probe, the four explicitly configured Better Stack resources, and up to ten recent unresolved Sentry issues from the selected projects over the last 14 days (all environments). Issue event counts are lifetime totals. API-local probes are separate from Better Stack's external checks: IDs should select the intended deployment's resources. Provider outages, rejected credentials, missing configuration, pending checks and paused monitoring are displayed separately from healthy status. A provider read failure does not erase the other provider's results. The API's existing Redis client is reused; dashboard reads do not enqueue jobs or send heartbeats.

Only allowlisted status fields, issue references/project/severity/count/last-seen timestamps, and constructed provider links reach the browser. No provider token, heartbeat capability URL, issue message, stack trace, user/request data, raw provider error or provider-supplied link is forwarded. Provider calls use fixed allowed origins, disallow redirects and have four-second deadlines. Dependency probes have two-second response deadlines, with at most one underlying probe pending per dependency. Full event diagnostics remain in Sentry; service logs open in Railway.

Configure these **private API-service variables**, never `VITE_*` or `EXPO_PUBLIC_*` values:

| Variable | Setup |
| --- | --- |
| `BETTER_STACK_API_TOKEN` | Uptime API token for the team's resources. |
| `BETTER_STACK_API_MONITOR_ID` | `4981049` for the prepared HireQuick API readiness monitor. |
| `BETTER_STACK_CHECKOUTS_MONITOR_ID` | `497964` |
| `BETTER_STACK_RECONCILIATION_MONITOR_ID` | `497965` |
| `BETTER_STACK_AUDIT_MONITOR_ID` | `497966` |
| `SENTRY_READ_TOKEN` | Sentry API token with `event:read` access to the selected organization/projects. The build-upload `org:ci` token is separate. |
| `SENTRY_ORGANIZATION` | Defaults to `studio-templar`. |
| `SENTRY_READ_PROJECTS` | Comma-separated project slugs or IDs; defaults to `react-native`. Add API/worker projects after creating them. |
| `SENTRY_API_ORIGIN` | Defaults to `https://de.sentry.io`; supported alternatives are `https://sentry.io` and `https://us.sentry.io`. |

The page is now deployed. After explicit destination approval, the validated Better Stack and Sentry read credentials were saved to the API service and verified without printing them. The deployed collector reports Sentry connected for `react-native`, `hirequick-api`, and `hirequick-worker`. Live HTTP checks confirm the admin assets match the release and unauthenticated monitoring requests return 401. The exact release's 18 focused observability/admin tests pass. Full-suite validation had separate unresolved failures; see the deployment record.

Browser checks use isolated API fixtures, including missing Sentry access, error/retry handling, stale snapshots, issue links, manual refresh and mobile navigation. The screenshots are labeled **UI test fixture** and do not certify production service health: [desktop](../documentation/validation-evidence/2026-09-25/betterstack/admin-observability-desktop.png), [mobile](../documentation/validation-evidence/2026-09-25/betterstack/admin-observability-mobile.png), [interaction checks](../documentation/validation-evidence/2026-09-25/betterstack/admin-ui-checks.json).

### Service logs

Railway captures stdout; API and worker observability entries are JSON. Set `LOG_LEVEL=info` so timings are retained. The base fields identify `service`, `env`, and `release`. Use separate service log views and search by `reqId` to connect an API failure to its request record. Route names are templates and may be relative to their mounted router; they are not raw request URLs.

If you want longer retention and dashboards in Better Stack, configure a Railway log collector/drain into a Better Stack log source, then verify ingestion. This repository does not provision that drain. Do not put a log-source ingestion token in mobile/admin environment variables.

Useful initial dashboard panels and suggested starting thresholds:

- API requests per minute and 5xx fraction; alert above 2% for five minutes with at least 50 requests in the window.
- API p95 `durationMs`, excluding `/health` and `/ready`; investigate sustained values above the TRD's 500 ms target.
- `job failed` count and job duration by `job`; alert on recurring failures or exhausted attempts.
- `operational alarm` by `code`; investigate every reconciliation/audit alarm using the [incident runbooks](OPERATIONS.md).
- `HEARTBEAT_DELIVERY_FAILED` warnings, readiness outages, and missing scheduled heartbeats.

These are starting policies to configure and tune, not dashboards or alert rules already installed by this change.

## Privacy and limits

The new HTTP logs exclude bodies, raw paths/query strings, headers, IP addresses, and user identity. Pino's `err` serializer keeps error type and stack frames but removes error messages, which can contain database values or provider responses. Sentry uses an allowlist of event metadata, internal tags, exception types, and stack locations; it removes request/user data, breadcrumbs, arbitrary context, source lines, local variables, and raw exception messages. Error grouping therefore relies primarily on stack locations; financial alerts have separate fingerprints.

Backend Sentry automatic integrations, request/SQL capture, session recording, and tracing are disabled. This does not audit every historical log statement. Admin crash reporting, product analytics (PostHog in the spec), infrastructure metrics, distributed traces, backend source-map uploads, and hosted log forwarding remain separate setup work. Mobile reporting is configured as described below.

Blank Sentry/heartbeat values leave hosted reporting off while retaining local JSON logs. Tests never initialize the production Sentry bootstrap. Do not treat a successful local test as proof that hosted ingestion, alert delivery, or production monitoring is live.

## Mobile Sentry project

The Expo app is configured for organization **`studio-templar`**, project **`react-native`**, using the supplied public DSN. This mobile project is separate from the backend's `SENTRY_DSN` configuration.

- `apps/mobile/index.ts` initializes Sentry before Expo Router loads route modules. The root is wrapped with Sentry, and the existing error fallback reports handled render failures once per error object.
- Release builds send errors; `__DEV__` builds do not. Native reporting is disabled in Expo Go and on web. Preview and production EAS builds carry distinct environment labels.
- `EXPO_PUBLIC_SENTRY_DSN` can override the default project. Explicitly setting it to an empty string disables reporting. The public DSN can be in the application bundle; the private upload token cannot.
- Metro uses Sentry's Expo configuration while preserving the existing `.js` → TypeScript resolver. Generated source maps carry debug IDs. The Expo plugin configures JavaScript source-map uploads, iOS debug-symbol uploads, and Android native-symbol/ProGuard uploads. Native source-context uploads are disabled.
- JavaScript error events are filtered to remove user/request data, raw error messages, breadcrumbs, source context, local variables, and arbitrary tags. Release/dist, source-map IDs, stack locations, and native instruction addresses are retained for symbolication. Screenshots, view hierarchies, session replay, and performance tracing are disabled; default PII collection is off. Native crashes are handled by the native SDK and are **not** guaranteed to pass through the JavaScript event filter; maintain Sentry server-side data scrubbing too.

### Build-upload authentication

On 2026-09-25, EAS confirmed that `SENTRY_AUTH_TOKEN` is present in the HireQuick project's **preview and production** environments. Its value was not displayed or retrieved. On 2026-09-26, replacement preview builds confirmed successful source-map uploads for Android build 11 and iOS build 5; iOS also uploaded 34 debug information files. The EAS variable currently uses Sensitive visibility; prefer Secret visibility for this organization upload token. Do not add it to `app.json`, `eas.json`, Git, or an `EXPO_PUBLIC_*` variable. The `ios-archive` profile inherits preview configuration and uses its environment.

The upload hooks are enabled. A native build without this token can fail during artifact upload; do not start the next release build until the token is configured. For an intentional local build without uploads, Sentry supports `SENTRY_DISABLE_AUTO_UPLOAD=true`; do not leave that override on for distributed releases that need readable stack traces.

Use the fresh previews linked in the [deployment report](../documentation/deployment-observability-2026-09-26.md). An older installed APK/IPA does not acquire the native Sentry SDK from repository changes. Uploads have been verified in EAS logs. Install the new build and trigger a controlled non-customer exception in a test build. Check that its stack resolves to TypeScript and that the environment/release match. Expo documents the [EAS build-token requirement](https://docs.expo.dev/guides/using-sentry/#usage-with-eas-build); Sentry documents the [Expo plugin](https://docs.sentry.io/platforms/react-native/guides/expo/).

### Setup verification

Android and iOS JavaScript/Hermes exports succeeded with source maps and Sentry debug IDs. Disposable Expo native prebuilds succeeded for both platforms. Mobile types and privacy tests were checked locally. These checks do not replace a signed native build or a device crash test.

The supplied ingestion endpoint accepted one synthetic event with HTTP 200: **`e2a777aec680471fae6eb878c3992737`**, environment **`setup-check`**, message **`HireQuick mobile monitoring setup check`**. This verifies DSN ingestion only; it does not prove native crash capture, uploaded symbols, or alert delivery. Remove any environment filter when locating that event in Sentry.
