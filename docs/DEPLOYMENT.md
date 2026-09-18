# Deployment and release

[Documentation index](README.md) · [Configuration](CONFIGURATION.md) · [Operations](OPERATIONS.md)

This is a release procedure derived from checked-in build and startup configuration. It does not assert that infrastructure, secrets, backups, alerts, or provider approvals are already configured. Resolve the [documented release gaps](STATUS.md) for the intended release scope.

## Deployment units

| Unit   | Build/start                                                    | Required connections                                                                            |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API    | Root `Dockerfile`; default process                             | PostgreSQL, Redis, configured providers; public HTTPS for clients and webhooks                  |
| Worker | Same image, `PROCESS_TYPE=worker`                              | Same database/provider environment and matching Redis transport namespace; no HTTP health route |
| Admin  | `Dockerfile.admin` with explicit `VITE_API_URL` build argument | Browser reaches HTTPS API; SPA fallback enabled by `serve -s`                                   |
| Mobile | Expo export for assets; EAS profiles for native distribution   | Bundled API URL; platform signing/distribution configuration                                    |

Root `Dockerfile` installs pnpm 10.27.0, generates Prisma, and builds the API with referenced packages. It **does not apply database migrations**. Both production commands use built files: `pnpm --filter @hq/api start` and `pnpm --filter @hq/api worker:start`. The worker development command uses watch mode and is not the production start command.

## Before release

1. Select the exact revision; run [CI-equivalent checks](TESTING.md) and relevant device/browser acceptance tests.
2. Review schema changes and old/new process compatibility. Plan forward repair for destructive migrations; application rollback does not undo a migration.
3. Confirm a recoverable database backup/restore point and a tested restoration procedure. Record the actual recovery owner, target recovery time, and data-loss tolerance in the deployment record; the repository does not configure these.
4. Configure environment using [Configuration](CONFIGURATION.md). Staging/production require strong JWT/OTP secrets and payment, delivery, storage, and Dojah values. Explicitly set CORS, proxy hops, provider mode, Redis, and client API origins.
5. Check the merchant/payment operating assumptions and outstanding TRD §23 questions for any live-money release. Documentation does not grant provider or regulatory approval.
6. Verify storage privacy, client upload access, OTP delivery, and webhook reachability in the intended environment. Do not use fixture identities as real admin accounts.

## Build and migrate

From the repository root, example image builds:

```sh
docker build -t hirequick-api:<release-tag> .
docker build -f Dockerfile.admin \
  --build-arg VITE_API_URL=https://<intended-api-host> \
  -t hirequick-admin:<release-tag> .
```

Replace angle-bracket placeholders before running. Keep runtime secrets out of build arguments and images. Review the build context and [dockerignore](../.dockerignore); application secrets should be supplied by the deployment secret store.

Run migrations once in an explicit deployment step using the selected revision and direct database credentials:

```sh
pnpm db:deploy
```

`DATABASE_URL` and `DIRECT_URL` must already refer to the intended environment. Use `prisma migrate status` to inspect migration state. Stop the release on failure; do not replace it with `db:push`, reset a shared schema, or mark a migration applied without investigating.

## Rollout

Deploy the API and worker from the same release. They share durable operation payloads and realtime transport behavior. In particular, the current authorized-envelope transport is incompatible with the former direct Redis adapter/emitter broadcast protocol; mixed versions can lose convenience signals.

Keep the API's public route available for provider callbacks during rollouts. Set the correct proxy trust count so rate limits apply to real client IPs. Confirm browser CORS allows the admin origin. Deploy the admin built for this API, and ensure mobile releases point at the correct environment.

The worker drains its queue/worker on SIGTERM/SIGINT, but the repository does not establish a comprehensive shutdown deadline policy. Configure and verify platform termination grace periods.

## Post-deploy acceptance

- `/health` returns `{"status":"ok"}`; separately verify database-backed reads and Redis connectivity.
- Worker starts, registers the expected schedules, and completes jobs; inspect failures and pending recovery work.
- OTP request/delivery, login, refresh, and logout work for intended account roles.
- Admin authenticates against the intended API and can read authorized queues; verify maker/checker separation with test fixtures where appropriate.
- In a provider TEST environment, confirm checkout, payment recording, wallet credit, withdrawal outcome, and recovery after a lost response.
- Verify cross-process realtime delivery with the current protocol and reconnect clients with session-bound access tokens. Confirm HTTP recovery still works when signals are missed.
- Check reconciliation and audit verification results; an HTTP 200 alone does not establish financial health.

Do not run synthetic financial tests against live customer records. Record the revision, migration result, image/client versions, environment, acceptance evidence, and unresolved items in a dated release record.

## Rollback and recovery

If the application release fails, identify whether it wrote new schema/data formats or dispatched provider operations. Roll back API and worker together only to a version compatible with the migrated database and existing durable records. Preserve original payment references and pending operations.

Prefer a reviewed forward fix for database changes. Restoring a database to an earlier point can erase evidence of provider transactions that already happened; reconcile external money movements before resuming processing. Never treat a database restore as a reversal of a bank transfer.

See [Operations](OPERATIONS.md) for uncertain payment outcomes, queue recovery, and reconciliation alarms.

## Native distribution

[apps/mobile/eas.json](../apps/mobile/eas.json) defines an internal preview APK and a production Android app bundle. The preview profile explicitly points to a deployed API; production must receive the intended `EXPO_PUBLIC_API_URL` through the build environment. `pnpm --filter @hq/mobile build` runs Expo export, not a signed native release.

The repository's EAS post-install hook builds `@hq/shared`. Signing credentials, store permissions, app submission, device acceptance, and release-channel ownership remain deployment responsibilities. Use the checked-in profiles with your authorized EAS environment rather than assuming a local asset export is ready for store distribution.
