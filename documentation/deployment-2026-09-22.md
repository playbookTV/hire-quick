# Approved settlement deployment — 22 September 2026

**Status: API, worker and admin deployed successfully to the existing TEST/staging application.**

## Release

Implements the owner-approved OVA-136 and OVA-137 policies: completed earnings stay HELD until Lagos event end + 72 hours; eligible undisputed bookings then release to the wallet. Client cancellations use the approved 100/50/0% refund split, commission within the usher allocation, immutable request quotes and existing two-admin controls. API, worker and admin use one frozen source snapshot.

- Railway project: HireQuick (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`).
- Railway environment: `production` (`637575af-e645-4287-a21f-520e7219fb4c`); application remains `NODE_ENV=staging`, `KYC_MODE=manual`, Paystack TEST.
- Snapshot: `/private/tmp/hirequick-release-20260922T000814Z`; 560 files; SHA-256 source digest `3f0a5503ecb2b8803532ba502c47a89a228d4f6a90d05fb5947e4d44b328bc35`.
- [Release manifest](validation-evidence/2026-09-22/release/release-manifest.json) records every included file and the base commit. The snapshot includes reviewed uncommitted changes, excludes local secrets/dependencies/build outputs/Redis persistence, and passed a configured-credential scan.
- Fixed the admin Docker build to compile its new shared-package dependency before the admin app, allowing a clean cloud build.
- No commit/push, native binary build/distribution or store submission is included. Existing installed mobile binaries do not gain the updated screens from this server deployment; they require a new app build.

## Validation and database

All three previously interrupted regressions now pass: the check-in lock race, reserved-refund sweep and audit-failure recovery. The run used a fresh disposable schema, applied all eight tracked migrations, confirmed zero drift, ran only these three cases and verified schema cleanup. [Final regression log](validation-evidence/2026-09-22/release/final-regressions.log). This resolves the final database-validation limitation in the [implementation report](payments/settlement-implementation-2026-09-21.md); earlier failure evidence remains preserved.

Earlier focused results include 24 core database tests, shared/unit checks, the HTTP held-completion lifecycle, amount limits and cancellation concurrency/failure tests. Source/static validation and admin/API builds passed; the mobile iOS/Android exports passed during implementation. This release reran shared/admin/API builds and documentation checks, then used clean cloud builds. It does not claim a full repository suite, native interaction or actual Paystack financial certification.

Read-only [preflight](validation-evidence/2026-09-22/release/preflight.json) confirmed matching API/worker database, Redis, signing and Paystack configuration and valid compiled environment settings. All eight applied migration checksums match. No new migration is required or applied by this release. Aggregate review found no existing COMPLETED, PAID or DISPUTED bookings in staging at preflight. No ledger backfill, wallet adjustment, schema reset, seed or provider financial probe was performed. Redis infrastructure was not redeployed.

## Deployment and checks

Worker rollout completed before the API upload; admin followed the API. Railway reports SUCCESS and one active deployment per service ([status evidence](validation-evidence/2026-09-22/release/railway-deployments.json)).

| Service | Deployment |
| --- | --- |
| Worker | `a5d51c88-4a1b-4093-867c-58fffc80a7e1` |
| API | `72ec1c14-365d-4f5e-8bb6-520a607defc8` |
| Admin | `ddfbfa33-088a-4337-9908-ce1be80dcc61` |

[Container verification](validation-evidence/2026-09-22/release/container-checks.json) passed for API and worker: intended deployment IDs and staging/TEST modes, eight applied migrations, database SELECT 1, Redis PONG, eight source hashes matching the manifest, compiled Lagos deadline and odd-kobo split checks. The worker logged `[worker] scheduled jobs ready`; no scheduled financial job was manually triggered.

[HTTP verification](validation-evidence/2026-09-22/release/http-checks.json) passed: API health 200, unauthenticated cancellation queue 401, exact admin-origin CORS 204, admin HTML/assets 200 and byte-for-byte asset hashes matching the verified local build. The served JavaScript includes the new cancellation views and intended API URL. No authenticated browser/native walkthrough or provider financial probe is claimed.

Access: [admin console](https://hirequick-admin-production.up.railway.app) · [API health](https://prolific-love-production-2775.up.railway.app/health).

Previous deployment IDs for incident reference:

| Service | Previous deployment |
| --- | --- |
| Worker | `3119613f-c073-4ad9-964c-4351a358ab67` |
| API | `590a76c1-98dd-490b-bdf9-69d49e0f9ece` |
| Admin | `0feb88e0-ca17-45c1-8998-eb568571a6c5` |

A rollback to pre-policy code could release earnings early or misinterpret new cancellation intents. Assess pending intents and hold obligations before reverting API/worker together; preserve financial records and references. No rollback reverses an external provider transaction.

OVA-166 account permission and fee/limit evidence remain a live-rollout gate. Deployment to TEST/staging does not certify live funds or publish updated mobile binaries.
