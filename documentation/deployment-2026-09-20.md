# Client test deployment — 20 September 2026

Status: **API, worker and admin deployed successfully.** Dojah biometric verification is disabled through explicit manual-review mode for this staging deployment. Identities are not automatically approved; document submission and authorized admin review remain available.

## Release

- Source: September 19 validated release plus the manual-review configuration change, tests and documentation. Matches the existing Android preview's server contracts.
- Snapshot: `/private/tmp/hirequick-release-20260920`; upload source: `/private/tmp/hirequick-upload-20260920`.
- Base commit: `8fa28a463ec620a00161c61d92f018d1734e155a` with the September 19 uncommitted flow implementation.
- 417 source/configuration files; SHA-256 source digest `3c6d131b55d6dc20601f1c1cc31dffee5f9b12143fb71de7a5a609be144446b2`.
- [Manifest](validation-evidence/2026-09-20/release/release-manifest.json). Deployment upload contains only verified source files, excluding dependencies, build output, local credentials and Redis dump artifacts. `.dockerignore` now also excludes Redis persistence files.
- Working repository was not committed or pushed. Other workspace changes were preserved.

## Verification configuration

Both Railway application services use `NODE_ENV=staging`, `KYC_MODE=manual` and existing Paystack TEST credentials. The Railway environment is named `production`; that label does not change the application's staging setting.

The default remains `KYC_MODE=dojah`. Explicit manual mode skips only the Dojah credential startup requirement and selects the existing unavailable-provider adapter, even if credentials are present. It cannot create biometric sessions or accept Dojah approval callbacks. Manual mode is rejected with `NODE_ENV=production`. JWT/OTP secrets, storage, payment and delivery requirements remain enforced. No user verification status was changed by this deployment task.

## Validation

- Workspace build/typecheck/lint/test-typecheck: **17/17 tasks passed** in the frozen snapshot. Includes API/admin builds and iOS/Android exports. [Log](validation-evidence/2026-09-20/release/checks.log).
- Test lint passed. [Log](validation-evidence/2026-09-20/release/test-lint.log).
- **40 focused tests passed**: 15 environment tests (including seven manual-mode cases) and 25 Dojah/unavailable-provider tests. The initial adapter run began before the dependent package build finished; rerunning after that build passed.
- Both deployed service configurations passed the compiled environment validator without displaying credentials.

## Database

Read-only comparison returned an empty migration against the pre-checkout schema. The migration files in the working repository and release matched byte-for-byte. The database contained an unfinished baseline record and omitted records for changes already present in the schema.

Registered `0_init`, `20260625145005_add_usher_discovery_client_business_notifications`, `20260628120000_compliance_remediation_consent_denylist_bvn`, and `20260701000000_client_feedback_round1` as already applied, using Prisma's migration-resolution command. Existing DDL was not replayed. The previously completed audit-FK migration was preserved.

Applied only the two pending tracked checkout migrations:

- `20260914190000_checkout_recovery`
- `20260914193000_checkout_notifications`

A subsequent full schema diff against the release returned an empty migration and exit 0. No schema reset, seed, ledger edit or wallet adjustment was performed.

Local migration tooling encountered a connection timeout; the known-working workspace runtime completed the checks and migrations successfully against the same verified target.

## Railway deployments

Project `HireQuick` (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`), environment `637575af-e645-4287-a21f-520e7219fb4c`.

| Service | Deployment | Verified state |
|---|---|---|
| API (`prolific-love`) | `25bea254-e0e4-4d1e-8efc-73158aaf292b` | SUCCESS; sole active deployment |
| Worker (`hirequick-worker`) | `92ead8e2-2535-4b92-9921-3496c6fad08c` | SUCCESS; sole active deployment |
| Admin (`hirequick-admin`) | `f2c889ad-6ebd-43d9-88c7-636ba36f0130` | SUCCESS; sole active deployment |

The first API/worker upload attempts timed out and left incomplete initializing records. Source-only archive retries succeeded; final status showed only the successful release active for each service. Redis infrastructure was not redeployed.

## Post-deployment checks

- API `/health`: HTTP 200, `{"status":"ok"}`; startup logs confirm port 8080 in staging.
- From the deployed API container: database `SELECT 1` passed; Redis returned `PONG`; actual mode was `manual`, staging, Paystack TEST.
- Unauthenticated admin read and biometric-start requests returned HTTP 401 with `UNAUTHENTICATED`.
- Admin-origin preflight returned HTTP 204 and the exact allowed origin.
- Worker started successfully and logged `[worker] resumeOps completed`.
- Admin HTML and both JavaScript/CSS assets returned HTTP 200. Title is HireQuick Admin; the JavaScript bundle contains the intended API origin.
- Browser-rendered acceptance could not be completed because the browser tool timed out. No authenticated admin/mobile walkthrough, OTP delivery test, biometric provider test or financial transaction test was performed during this deployment.

## Client access

- [Admin console](https://hirequick-admin-production.up.railway.app)
- [API health](https://prolific-love-production-2775.up.railway.app/health)
- [Existing Android preview APK](https://expo.dev/artifacts/eas/y3o11o1kS4B6AgZlwyMGbD6ZAmW9raq370fhqeb4shs.apk), built September 19. No new native build or store submission was needed for this server-only verification setting.

## Restore biometric verification

Configure valid Dojah App ID, secret and widget ID, switch both services to `KYC_MODE=dojah`, and redeploy them together. Validate the provider flow before treating it as available. No fabricated credentials were installed.
