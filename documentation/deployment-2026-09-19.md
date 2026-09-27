# Release — 19 September 2026

Status: **Android preview built successfully on EAS; server deployment blocked by missing Dojah configuration.**

## Source

- Clean snapshot: `/private/tmp/hirequick-release-20260919T160553Z`.
- Workspace base: `8fa28a4`; includes the uncommitted flow implementation and two test-only type assertion corrections made during release checks.
- Snapshot commit: `5126dc91390a6c6d7edd8c0c46f59080879347a3` (local release snapshot only; no commit or push to the working repository).
- 418 source/config files. SHA-256 source digest: `2447436e515ee058415372a8c8a353b4782fb32a7e1d2697154d26740b1b0317`.
- [File manifest](validation-evidence/2026-09-19/release/release-manifest.json). No local credential files are included. Snapshot contents were rechecked against the manifest after EAS upload.

## Validation

The preceding implementation passed 151 scoped tests, workspace typecheck/lint, admin build and iOS/Android exports. See [flow status](../audits/2026-09-18/FLOW-IMPLEMENTATION-STATUS.md) for scope and limits.

Release preparation also ran test typechecks and test lint. Two new test harnesses needed an explicit `unknown` boundary when inspecting Express's internal route stack; these test-only corrections passed both checks. Frozen-lockfile dependency installation, Prisma generation, API build and admin production build in the snapshot all succeeded.

## Android EAS build

- Project: `@ovalay-studios/hirequick` (`2b9864f5-7637-4151-983b-8a1bc1c29459`).
- Build: `0c107b43-67cb-4e57-af68-09b6768f989e`.
- [EAS build page](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/0c107b43-67cb-4e57-af68-09b6768f989e).
- Profile: `preview`, Android APK, internal distribution. Existing remote signing credentials reused without modification.
- API URL: `https://prolific-love-production-2775.up.railway.app` from the checked-in preview profile.
- Source upload completed (1.3 MB); EAS status `FINISHED` at `2026-09-19T16:23:22.681Z`.
- [Install Android APK](https://expo.dev/artifacts/eas/y3o11o1kS4B6AgZlwyMGbD6ZAmW9raq370fhqeb4shs.apk).
- No Play Store submission, iOS build, or OTA update was performed.

## Railway readiness

Project `HireQuick` (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`), environment named `production`; API and worker actually run `NODE_ENV=staging` with Paystack TEST keys.

Both `prolific-love` and `hirequick-worker` still lack `DOJAH_APP_ID`, `DOJAH_SECRET_KEY` and `DOJAH_WIDGET_ID`. Current source requires these values at startup. No fake credentials or startup-guard bypass was introduced. The user was asked to save real values in Railway's API secret configuration; synchronization to the worker is pending that input.

Existing JWT/OTP, payment, Brevo, database, Redis and storage settings are present. API/worker equality checks passed for JWT access/refresh, OTP signing, database, Redis, storage bucket and Paystack key values; no secret values were logged. API CORS includes the admin origin and its trusted proxy setting is 1. Admin's build-time API URL matches the preview app.

No API/worker/admin source deployment was started while that startup blocker remains. Deploying only the new admin would expose screens whose server contracts are not yet available.

## Database readiness (read-only)

The selected service database uses schema `public`. Migration history still contains a completed `20260627121512_drop_audit_actor_fk` plus an unfinished `0_init` with zero applied steps. A fresh Prisma schema comparison matches the earlier investigation: the missing schema consists of the checkout enum/table/indexes/foreign key and `CHECKOUT_UPDATED` notification enum value.

A second comparison against a temporary model with only the checkout additions removed returned an empty migration and exit 0, confirming the pre-checkout schema already matches. Before server rollout, reconcile only verified existing migration history, then apply the two tracked checkout migrations (`20260914190000_checkout_recovery`, `20260914193000_checkout_notifications`) and verify zero schema drift. No migration, history rewrite, schema reset or seed was performed in this release attempt.

The Android artifact will contain the new flows, but those server-dependent flows require the pending backend release. Build success is not end-to-end acceptance.

## Existing server versions

These remained running throughout preparation:

| Service | Deployment ID |
|---|---|
| API | `02003015-2c5e-45c4-ab8a-6e998a55c3ff` |
| Worker | `e02c1b7b-cf7e-44cf-a095-021cd2fcffe0` |
| Admin | `3e2f74d3-909a-443b-91dc-1953072cea04` |

> Follow-up: the [20 September client test deployment](deployment-2026-09-20.md) completed with explicitly authorized manual verification mode.
