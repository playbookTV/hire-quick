# Payment recovery deployment — 21 September 2026

Status: **API, worker and admin deployed successfully to the existing staging application.**

## Release scope

The user requested deployment after approving and documenting the dispute and cancellation policies. This release deploys the implemented payment-recovery scheduling and reconciliation alarm fixes. The approved 72-hour hold and late-cancellation split policies remain specifications pending OVA-136/137 implementation; deploying this snapshot does not activate them.

- Project: HireQuick (`396c28f8-30ac-4fd8-ba96-684e9a27d0e6`).
- Railway environment: `production` (`637575af-e645-4287-a21f-520e7219fb4c`); application mode remains **staging**, `KYC_MODE=manual`, with Paystack **TEST** credentials.
- Snapshot: `/private/tmp/hirequick-release-20260921T195608Z`, 473 source/configuration/documentation files.
- Source digest: `101bf89a21aca18fc06c05fea0940cb498b84483ae31017eba321b92e291f213`.
- [Release manifest](validation-evidence/2026-09-21/release/release-manifest.json) records the base commit and individual file hashes. The snapshot includes reviewed uncommitted changes. Files were compared against the validated workspace before upload; credential-pattern checks passed. Local secrets, dependencies, build outputs and Redis persistence files were excluded.
- No workspace commit or push, store submission or new native build is part of this server release.

## Validation

API/admin builds, typechecks, lint and API test-typechecking passed (9/9 Turbo tasks). Root test typechecking, test lint and documentation checks passed. All seven focused reconciliation-alarm and bank-registration tests passed again before rollout. Earlier [payment validation](payments/todo-validation-2026-09-21.md) records 220 focused passing tests including isolated database and HTTP lifecycle coverage; this release did not rerun the entire database suite or certify the unimplemented policies.

Both selected service configurations passed the compiled environment validator. API/worker database, Redis, JWT, OTP-signing and Paystack settings matched without exposing secret values.

## Database

All seven previously applied migration checksums matched this release. Read-only schema comparison showed only the expected additive payment-recovery migration. Applied `20260921183840_payment_recovery_schedule` once: three recovery scheduling columns and one index on `payment_operations`. The post-migration schema comparison returned an empty migration. Existing API/worker versions remain compatible with these additive fields.

No schema reset, seed, synthetic financial transaction, ledger mutation or wallet adjustment was performed by release validation. Existing workers continue their normal scheduled processing. No new backup/restore rehearsal was performed; this release does not certify disaster recovery.

## Deployments and verification

Railway reports SUCCESS with one active deployment per service:

| Service | New deployment |
| --- | --- |
| API (`prolific-love`) | `590a76c1-98dd-490b-bdf9-69d49e0f9ece` |
| Worker (`hirequick-worker`) | `3119613f-c073-4ad9-964c-4351a358ab67` |
| Admin (`hirequick-admin`) | `0feb88e0-ca17-45c1-8998-eb568571a6c5` |

[Deployment status evidence](validation-evidence/2026-09-21/release/railway-deployments.json) and [read-only post-deployment checks](validation-evidence/2026-09-21/release/post-deploy-checks.json):

- API and worker containers report the intended deployment IDs, staging mode, manual verification and Paystack TEST mode.
- Hashes of deployed job/recovery source and Prisma schema match the release manifest in both containers.
- Database `SELECT 1` passed in both containers; eight applied migrations are present; recovery columns are readable through the generated Prisma client.
- Redis returns PONG from both containers.
- Worker deployment logs confirm `[worker] scheduled jobs ready`. The 15-minute recovery job was not manually triggered; an actual recovery cycle or alarm delivery is not claimed from startup evidence alone.
- API `/health` returns HTTP 200 and `{"status":"ok"}`.
- Unauthenticated `/api/admin/stats` returns HTTP 401; admin-origin preflight returns HTTP 204 with the exact allowed origin.
- Admin HTML and its JavaScript/CSS assets return HTTP 200; the JavaScript bundle contains the intended API URL.
- Redis infrastructure was not redeployed. No authenticated account walkthrough, OTP delivery test, provider-side financial probe, pager/alarm rehearsal or device build was performed during this release.

Client access: [admin console](https://hirequick-admin-production.up.railway.app) and [API health](https://prolific-love-production-2775.up.railway.app/health).

Previous deployments for application rollback, with the additive database migration retained:

| Service | Previous deployment |
| --- | --- |
| API (`prolific-love`) | `d715ba54-1296-480b-bf81-c1f25b5b7981` |
| Worker (`hirequick-worker`) | `92ead8e2-2535-4b92-9921-3496c6fad08c` |
| Admin (`hirequick-admin`) | `190529cc-0766-40e9-b1a3-cde45cbe96f8` |

Roll back API and worker together if necessary; retain payment references and operation records. A rollback must not be represented as reversing any provider-side financial action.
