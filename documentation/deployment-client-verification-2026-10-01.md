# Client verification release 1 October 2026

The owner authorized deployment of mandatory client identity verification and business verification, confirmed that Smile business verification is activated, and explicitly waived the proposed backup step. The live migration completed at 20:19 UTC. API, worker and admin deployments succeeded, and both signed mobile builds finished. Public and authenticated API acceptance checks passed.

## Source and scope

- Frozen release revision: `f3c979eac7c4f110e4dc35f3037452d8e17d5934`, based on `384a5b8c8a38b9f29a7d55be7f38b21b43a22a9f`.
- [Release manifest and runtime source hashes](validation-evidence/2026-10-01/client-verification-release/release-manifest.json).
- Mandatory personal identity checks for all clients; business clients additionally require a matching registry result and explicit representative-authority review.
- Existing paid booking obligations remain accessible. Existing clients are not automatically granted verified status.
- The earlier deployed upload improvements remain included. No payment policy, provider credentials, hosting region or store distribution settings are changed.

## Deployment state

| Target | Release | State |
| --- | --- | --- |
| Database | `20261001190000_client_identity_and_business_verification` | Applied and verified |
| API | `b9c3ec5a-839a-4f0a-a09b-2f47fb899a79` | SUCCESS |
| Worker | `978448b5-2fa6-42fb-8a1b-c15f28606834` | SUCCESS |
| Admin | `29192e71-feb7-4eff-bd26-79fa9398d63b` | SUCCESS |
| Android preview 23 | `25ae9239-fb9c-4835-a813-abf460fd4b8b` | Finished; artifact HTTP 200 |
| iOS preview 13 | `e45b80f1-971d-4147-906c-e2770aa0019f` | Finished; artifact HTTP 200 |

Both mobile builds use the frozen revision and existing signing credentials. Android uses an internal APK; iOS uses ad hoc distribution to already registered devices. These are not public app-store releases or OTA updates. Clients must install the new app to complete the required verification journey.

Install [Android preview 23](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/25ae9239-fb9c-4835-a813-abf460fd4b8b) or [iOS preview 13](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/e45b80f1-971d-4147-906c-e2770aa0019f). iOS finished at 20:01 UTC and Android at 20:23 UTC. Both install archives returned HTTP 200 with nonempty content lengths: [Android evidence](validation-evidence/2026-10-01/client-verification-release/android-status.json), [iOS evidence](validation-evidence/2026-10-01/client-verification-release/ios-status.json). Older installed clients lack the required new verification screens and must update.

Railway's environment remains named `production`; existing application/provider settings were not changed. The worker still reports the existing `staging` observability environment and `hq-sentry-20260928` Sentry label. Identify this release by its deployment IDs and frozen source manifest, not that older Sentry label. Both API and worker use production Smile ID.

## Database and recovery

The [read-only preflight](validation-evidence/2026-10-01/client-verification-release/database-preflight.json) confirmed matching API/worker database targets, matching historical migration checksums, and exactly the intended pending migration. Both services use `KYC_MODE=smile` and `SMILE_ENVIRONMENT=production`.

The safety reviewer blocked a proposed full database export to restricted local temporary storage because the owner had not explicitly authorized copying sensitive production identity, customer, audit and financial data to that destination. No export was performed. The owner then explicitly instructed deployment without the backup step; see [authorization](validation-evidence/2026-10-01/client-verification-release/deployment-authorization.json). Managed backup availability, recovery objectives and a production-data restoration rehearsal remain unverified. PostgreSQL 18 tooling was installed for the proposed rehearsal; no background database service was enabled.

The [live migration result](validation-evidence/2026-10-01/client-verification-release/database-migration.json) confirms the client verification columns, new business-verification table and validated exactly-one-subject constraint. Historical migration checksums matched before applying the single intended migration. No database reset, fixture seed, synthetic financial transaction, local production-data export or ledger rewrite was performed.

Previous deployment IDs are API `4b9a1f43-7cf4-4dd1-a336-dcb5458e3632`, worker `e07780fd-ef40-4ef4-acb2-d387b8da141a`, and admin `24f0d4ff-04d8-4cec-bdd0-16c69ef1c120`. The migration is additive for existing rows, but new client identity attempts have a null usher subject. Once those records exist, reverting to the old usher-only code is not a safe generic rollback. Prefer a compatible forward fix; preserve all verification and financial history. A database restore does not reverse external provider operations.

## Validation and limits

Before release, 125 unique targeted API tests passed, plus the business approval HTTP regression rerun. Shared 82, mobile 65 and admin 11 tests passed. Workspace/application/test typechecks, lint, documentation links, Android/iOS JavaScript exports, and responsive mocked-screen checks passed. The admin production bundle also compiled successfully during release preparation.

After deployment, `/health` and `/ready` returned HTTP 200; unauthenticated client/admin business-verification reads returned HTTP 401. The deployed admin asset contains the new business review controls and correct API origin. See [public HTTP acceptance](validation-evidence/2026-10-01/client-verification-release/http-acceptance.json).

[Authenticated acceptance](validation-evidence/2026-10-01/client-verification-release/authenticated-acceptance.json) returned HTTP 200 for both admin verification queues and the client's profile, business-verification status and booking list. Staff discovery for an unverified client returned HTTP 403 with `CLIENT_VERIFICATION_REQUIRED`. Checks used 60-second tokens held only in process memory, retained no customer response records, and produced only normal queue-read audit entries. This was not a fresh OTP login or a test of every paid booking action.

The worker logged scheduled-job readiness at 20:21 UTC. [Worker startup evidence](validation-evidence/2026-10-01/client-verification-release/worker-startup.json). Direct container inspection was unavailable because the Railway CLI required an SSH key; no new access key was created. Runtime acceptance instead used the public API, platform deployment state and worker logs. No post-deployment source-hash comparison inside the containers was performed.

Physical-device capture, a real customer business lookup, authority review and installed-device acceptance have not been performed by this release task. Provider activation is owner-confirmed, not inferred from local tests. Existing historical audit-chain integrity findings remain open; this feature does not repair or clear them.
