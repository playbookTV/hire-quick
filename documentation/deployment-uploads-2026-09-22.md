# Chat and uploads deployment — 22 September 2026

Status: API and worker deployed successfully to TEST/staging; post-deployment checks passed.

The owner requested Linear updates followed by deployment. This release deploys the Gifted Chat backend contracts, verified uploads, and durable storage cleanup to the existing TEST/staging application.

## Release and target

- Railway project: HireQuick (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`). Railway environment is named `production`; the application remains `NODE_ENV=staging` with Paystack TEST keys.
- Frozen source snapshot: `/private/tmp/hq-upload-release-20260922T170713Z`; source digest `d250d1840b30ba40817a723d9c635a74e9f0c9e6f3d5543fa7c0ad4e3cfa17fe`.
- [Manifest](validation-evidence/2026-09-22/uploads-release/release-manifest.json) records the included source hashes and changes from the previous deployed snapshot. Configured credential scanning passed; local secrets and unrelated website work were excluded. No workspace commit or push was performed.
- Worker: `a19f894e-9206-4819-b9fe-c73320be4106`.
- API: `bb7de256-c69b-4e79-89bd-bfbc203e3b4b`.
- Admin remains at `ddfbfa33-088a-4337-9908-ce1be80dcc61`; its source is unchanged from the previous release. Redis infrastructure was not redeployed.

## Database and validation

Applied only `20260922160357_upload_intents_and_storage_deletions`, creating two metadata tables and their indexes. All nine applied migration checksums match source, both new tables exist, and the read-only schema comparison reports zero drift. No schema reset, seed, backfill, ledger mutation or financial provider probe was performed. Evidence: [database checks](validation-evidence/2026-09-22/uploads-release/database-preflight.json), [drift check](validation-evidence/2026-09-22/uploads-release/database-drift.json).

The earlier implementation passed 51 focused database/local cases; the deployment fix adds three passing R2 copy-address regression cases. API builds, API/mobile typechecks and relevant lint passed. The cloud image also asserts that both compiled entrypoints exist. These checks do not claim a full repository suite or native interaction certification.

The [real R2 round-trip](validation-evidence/2026-09-22/uploads-release/r2-roundtrip.json) passed exact-byte PUT, bounded inspection, ETag-conditioned copy, signed download, unsigned S3 access denial, and deletion. Both temporary test objects were confirmed absent afterward. An existing endpoint with a bucket path stores physical keys with an extra bucket prefix; copy now preserves that convention. Public bucket domains and lifecycle configuration were not audited or changed. See the physical-prefix guidance in the [upload record](uploads-2026-09-22.md).

## Rollout repairs

The initial migration command collided with pnpm's built-in `deploy` command and exited before database mutation. The root script now explicitly invokes `run deploy`; the migration then succeeded.

The first worker image (`ed0a3d03-bdd3-4731-b268-9958333a7f54`) lacked compiled entrypoints because the Docker context included local TypeScript incremental cache files while excluding compiled output. The image now excludes `**/*.tsbuildinfo` and checks both entrypoints during its build. The corrected worker started successfully. The prior worker/API remained active during the failed attempt. [Attempt record](validation-evidence/2026-09-22/uploads-release/rollout-attempts.json).

## Running-service checks

Railway reports SUCCESS and one active deployment each for API and worker ([status](validation-evidence/2026-09-22/uploads-release/railway-status.json)). Both containers confirm the expected deployment IDs, staging/TEST mode, database connectivity, Redis PONG, nine applied migrations, both new tables and eight source hashes matching the frozen manifest: [API](validation-evidence/2026-09-22/uploads-release/api-container-checks.json), [worker](validation-evidence/2026-09-22/uploads-release/worker-container-checks.json).

The worker reports startup readiness, one registered cleanup schedule and one cleanup worker. Multiple scheduled cleanup runs completed with zero failures. A read-only inspection also found pre-existing legacy `transferRetry` jobs failing as unknown jobs in the old shared queue, including failures before this rollout. They were not retried, deleted or otherwise mutated. Their retirement/recovery mapping needs a separate payment-scheduler review; upload cleanup runs independently.

[HTTP checks](validation-evidence/2026-09-22/uploads-release/http-checks.json) confirm API health 200, unauthenticated finalize/upload/history requests 401, the expected admin-origin CORS response 204, and admin HTML 200. No authenticated customer session or native walkthrough was used.

Access: [API health](https://prolific-love-production-2775.up.railway.app/health) · [admin](https://hirequick-admin-production.up.railway.app).

## Mobile and remaining verification

The finished [Android build 6](android-rebuild-2026-09-22.md) contains the matching Gifted Chat and finalized-upload mobile code; six relevant file hashes match ([compatibility check](validation-evidence/2026-09-22/uploads-release/android-compatibility.json)). Older builds cannot create attachments using the new byte-size/finalization contract. This server deployment does not update installed apps or submit a store release. On-device chat, upload and replacement interaction remain untested.

OVA-174 remains In Review for final acceptance/device checks. OVA-146 remains In Progress for the retained financial idempotency email fingerprint and remaining erasure/metadata inventory. OVA-172 remains In Progress for non-chat pagination, realistic fixture profiling and broader contract coverage.

Previous API and worker deployment IDs: `72ec1c14-365d-4f5e-8bb6-520a607defc8` and `a5d51c88-4a1b-4093-867c-58fffc80a7e1`. The additive tables can remain during rollback. Retain upload/deletion intents and tombstones; old API code does not enforce the new finalization contract, so assess mobile compatibility and attachment writes before rollback. Restore-point readiness was not independently verified.
