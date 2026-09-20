# Release preparation — 16 September 2026

Status: **prepared; Railway authenticated; deployment blocked by missing Dojah credentials**. Approved configuration updates were saved with deployment suppressed. No source upload, deployment, database migration, or native distribution was performed.

## Frozen source

- Snapshot: `/private/tmp/hirequick-release-20260916T112317Z`
- Base commit: `775d9289a75659d590bc637044cf809135eb422e`; includes uncommitted source present when captured.
- Files: 405, excluding local credentials, dependencies, generated output, agent configuration, audits and historical documentation.
- Source digest: `270e61a6aabd9884ae674fb59ab935e21cad61050b226aa279de2c0707f3f1f3`.
- [Manifest](validation-evidence/2026-09-16/release/release-manifest.json) records each file hash and digest format.
- Release preparation removed one invalid `react-hooks/exhaustive-deps` suppression from the withdrawal screen; that rule is not registered in the ordinary lint configuration. Application behavior is unchanged. The fix exists in the workspace and snapshot.

## Validation

- Frozen dependency installation and Prisma client generation passed.
- Workspace typechecks, production lint and test typechecks: 14/14 tasks passed. [Log](validation-evidence/2026-09-16/release/checks.log).
- Test lint passed. [Log](validation-evidence/2026-09-16/release/test-lint.log).
- API/admin builds and Expo iOS/Android exports passed: 5/5 tasks. [Log](validation-evidence/2026-09-16/release/build.log). Exports are not signed native releases.
- UI recovery tests: 36 passed. Admin read-handler tests: five passed against in-memory doubles with an unreachable placeholder database URL; no database connection was made.
- Workspace documentation check passed: 249 links across 19 maintained documents. This was run in the workspace because historical documentation is intentionally excluded from the deployment snapshot.
- Earlier financial/realtime database validation is documented in [batch validation](checkout-ledger-realtime-validation-2026-09-14.md). It was not rerun against a deployment database.
- Existing API `https://prolific-love-production-2775.up.railway.app/health` returned HTTP 200 and `{"status":"ok","service":"hirequick-api"}`. This is a pre-deploy check of the existing version, not acceptance of the new release.

## Deployment preflight after authentication

- Project: HireQuick (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`), Railway environment `production` (`637575af-e645-4287-a21f-520e7219fb4c`). API and worker actually run `NODE_ENV=staging` with Paystack TEST credentials.
- Existing services: API `prolific-love` (`85b4bcff-3dbc-48a9-882c-17da83ed20ef`); worker `hirequick-worker` (`2640683c-6796-4015-92f1-26075852b05c`); admin `hirequick-admin` (`42070d14-5076-4a76-855f-1edd118f5485`). API/worker use Dockerfile; admin uses Dockerfile.admin and the correct API URL.
- User explicitly approved generating an OTP verification secret shared by API/worker; copying existing API JWT, Brevo and storage settings to the worker; explicitly configuring webhook verification with the existing Paystack TEST secret; CORS for `https://hirequick-admin-production.up.railway.app`; and one trusted proxy hop.
- Those missing values were saved using `--skip-deploys`. Existing secrets were retained; secret values were not printed or saved in this record. The initial automatic review rejection was resolved by explicit user approval before the writes.
- Both services still lack `DOJAH_APP_ID`, `DOJAH_SECRET_KEY`, and `DOJAH_WIDGET_ID`. The current staging/production environment validator requires them. The user was asked to configure the API service; worker synchronization remains pending. Do not bypass the startup guard or supply fake credentials.

## Database findings (read-only)

Prisma reports five migrations pending, but schema inspection found that the older changes already exist. Migration history contains a completed `20260627121512_drop_audit_actor_fk` and an unfinished `0_init`. No migration was attempted during this deployment task.

A full Prisma schema diff against the release shows only the new `CheckoutState` enum, `checkouts` table/indexes/foreign key, and `CHECKOUT_UPDATED` notification value. A second diff against a temporary schema with exactly those checkout additions removed returned an empty migration and exit 0. Thus the current schema matches the pre-checkout release schema; old migration history needs reconciliation before deploying the two new tracked checkout migrations. This comparison covers Prisma-managed schema, not arbitrary database triggers or operational backup status.

## Pending deployment

1. Obtain the missing Dojah configuration and verify the complete API/worker startup configuration.
2. Inspect the unfinished baseline migration record, reconcile only verified existing migration history, and apply the two new tracked checkout migrations. Never use `db:push`, reset, seed, or replay already-existing DDL.
3. Deploy API and worker from the frozen snapshot together, then admin; verify service health, worker startup and database/Redis readiness. Record deployment IDs and actual acceptance evidence here.
4. Native distribution remains out of scope pending the user's Android preview preference; no APK was uploaded or published.

Native device acceptance and real authenticated admin integration remain outstanding; static checks and exports do not establish those results.

> Follow-up: the [20 September client test deployment](deployment-2026-09-20.md) completed with explicitly authorized manual verification mode.
