# Marketplace release — 2 October 2026

The owner authorized deployment of the completed marketplace improvements. The live database migration, API, worker and admin rollout completed successfully. Signed Android and iOS preview builds finished from the same frozen source, and both install archives were verified.

## Scope and source

The release includes optional physical attributes and explained job preferences, decline reasons and notes, pre-booking reports with an admin review queue, job search and sharing, rich client/company profiles, application withdrawal, and selection-preserving bulk invitations. The earlier deployed client verification and upload improvements are preserved.

Frozen revision: `80c2bb0bf1c5e346e8f51b02ae719bd76178146b`. The workspace's existing uncommitted work was left intact. The release was committed only in an isolated local snapshot; no repository push was performed. [Source manifest and deployment evidence](validation-evidence/2026-10-02/marketplace-release/release-manifest.json).

## Deployment

| Target | Release | Result |
| --- | --- | --- |
| Database | `20261002103905_marketplace_profile_and_hiring` | Applied; columns and report constraints verified |
| API | `a61c00c6-047a-4227-aa02-3a13f3e3bb66` | Live; acceptance passed |
| Worker | `aefd5c37-26c6-4866-b83b-f860aec36180` | Scheduled jobs ready at 12:23:59 UTC |
| Admin | `138e7179-72dd-424a-932e-d5fb9e6c654a` | Live; deployed asset includes marketplace review |
| Android preview 24 | `3ed8c3d3-301b-4edd-9435-a2981562f28d` | Finished; install archive verified |
| iOS preview 14 | `65b5f209-bb3e-44ca-a5d3-d151af565468` | Finished; install archive verified |

The Railway environment remains `production`. Existing provider settings, signing credentials and distribution channels were retained. The worker still uses the existing `staging` observability environment and older Sentry release label; use deployment IDs and the source manifest to identify this release.

The mobile distribution remains an internal Android APK and ad hoc iOS build for registered devices. This is not a public app-store or OTA release. Install [Android preview 24](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/3ed8c3d3-301b-4edd-9435-a2981562f28d) or [iOS preview 14](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/65b5f209-bb3e-44ca-a5d3-d151af565468). Android finished at 12:51:06 UTC; iOS finished at 12:27:21 UTC. Both archives returned HTTP 200 with nonempty content lengths. See [Android evidence](validation-evidence/2026-10-02/marketplace-release/android-status.json) and [iOS evidence](validation-evidence/2026-10-02/marketplace-release/ios-status.json). Installed clients must update to receive the new screens and interactions.

## Verification

Preflight confirmed matching API/worker database targets, matching historical migration checksums and exactly one pending migration. The additive migration completed at 12:19:58 UTC. All eight profile/invitation columns and the report target check were verified; report target foreign keys reject deletion. [Migration result](validation-evidence/2026-10-02/marketplace-release/database-migrate.json). A post-release comparison found no schema drift and no pending migrations: [database comparison](validation-evidence/2026-10-02/marketplace-release/database-diff.json).

Public checks returned HTTP 200 for health/readiness and HTTP 401 for protected unauthenticated routes. The live admin asset contains the marketplace report and category controls and points to the correct API. [HTTP acceptance](validation-evidence/2026-10-02/marketplace-release/http-acceptance.json).

Authenticated read-only acceptance passed for the report queue, presentation policies, existing business verification queue, client and worker profiles, public client profile privacy, and job search. An unverified client remains blocked from staff discovery and retains booking access; a worker receives HTTP 403 from the admin report queue. Tokens lasted 60 seconds, were held only in process memory, and no response records or tokens were retained. Normal admin queue-read audit entries were the only application writes made by these checks. [Authenticated acceptance](validation-evidence/2026-10-02/marketplace-release/authenticated-acceptance.json).

The worker confirmed scheduled-job readiness. [Startup evidence](validation-evidence/2026-10-02/marketplace-release/worker-startup.json). No synthetic financial transactions, customer reports, invitations or profile edits were made during live acceptance.

Pre-release validation comprised 229 targeted automated tests, type/lint checks, database migration validation, native JavaScript exports and responsive screen previews. See [implementation validation](marketplace-gap-closure-2026-10-02.md).

## Recovery and remaining acceptance

The previous compatible release IDs are API `b9c3ec5a-839a-4f0a-a09b-2f47fb899a79`, worker `978448b5-2fa6-42fb-8a1b-c15f28606834`, and admin `29192e71-feb7-4eff-bd26-79fa9398d63b`. The schema additions are nullable fields and new tables; preserve report and invitation data during any recovery and prefer a compatible forward fix. Application rollback does not reverse the database migration.

No production-data export or database restore was performed. Managed backup availability and recovery objectives remain unverified, as recorded in the [previous release](deployment-client-verification-2026-10-01.md). The existing historical audit-chain findings remain outside this feature's scope.

Installed-device share sheets, cold-start job links through real sign-in/verification, native photo uploads and screen-reader behavior remain unverified. Shared job links require the installed app; there is no web-preview/install fallback. The release checks do not constitute device acceptance.
