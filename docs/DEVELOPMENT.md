# Development guide

[Documentation index](README.md) · [Contributing](../CONTRIBUTING.md) · [Testing](TESTING.md)

## Choose the right boundary

Begin with [Architecture](ARCHITECTURE.md) and the relevant specification. Put reusable money/policy/validation logic in `packages/shared`; persistence and provider effects belong in the API. Keep route handlers focused on validation, authentication, authorization, and response mapping. Business operations belong in feature services. Ledger mutations belong exclusively in the ledger engine.

Backend/shared packages are TypeScript ESM with NodeNext resolution: use `.js` extensions for relative imports. Import database clients/types through `@hq/database`. Build dependencies after changing a package's public API; a downstream editor or isolated check may otherwise read stale `dist` declarations.

## Commands and scope

Run from the repository root with the appropriate environment exported.

| Task                                   | Command                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| Backend build plus referenced packages | `pnpm --filter @hq/api build`                                         |
| Shared logic build                     | `pnpm --filter @hq/shared build`                                      |
| Admin checks/build                     | `pnpm --filter @hq/admin typecheck` / `pnpm --filter @hq/admin build` |
| Mobile typecheck                       | `pnpm --filter @hq/mobile typecheck`                                  |
| Workspace build/check/lint             | `pnpm build` / `pnpm typecheck` / `pnpm lint`                         |
| Test-source checks                     | `pnpm typecheck:tests` / `pnpm lint:tests`                            |
| Targeted formatting                    | `pnpm exec prettier --write <changed-files>`                          |
| Documentation links                    | `pnpm docs:check`                                                     |

`pnpm format` formats the entire repository; prefer targeted formatting when a broad rewrite is not intended. API `typecheck` uses `tsc -b` and may emit outputs; it is not a pure `--noEmit` command. Admin/mobile typechecks use `--noEmit`. Root build includes Expo export for iOS/Android assets, not signed app-store binaries.

## Adding or changing an endpoint

1. Identify the mounted router in [API](API.md). Inspect its service and ownership checks, not just a matching path string.
2. Define/adjust a shared Zod DTO where appropriate. Some existing input schemas are route-local; an unused shared DTO is not the deployed contract.
3. Enforce current account status, role, resource ownership, and legal lifecycle state. A valid UUID or ADMIN token is not sufficient authority for party-only actions.
4. For money operations, read the cited specification and [Payments](PAYMENTS.md), preserve locks and durable intent/reference handling, and update reconciliation if money flows change.
5. Return stable error codes through `ApiError`; preserve generic unexpected-error responses.
6. Add focused behavior tests and update API/workflow/status documentation with the change.

## Mobile application

Routes live in `apps/mobile/app` under `(auth)`, `(client)`, `(usher)`, `(verification)`, and `(modals)`. Shared UI and styling should follow existing components rather than duplicating screen-specific patterns.

Key implementation boundaries:

- [HTTP client](../apps/mobile/lib/client.ts) delegates to session-bound request handling and creates logical idempotency keys.
- [Query configuration](../apps/mobile/lib/query.ts) defines query keys, a 30-second stale time, bounded transient query retries, and no automatic mutation retries.
- [Checkout controller](../apps/mobile/lib/checkout.ts) and [withdrawal controller](../apps/mobile/lib/withdrawal.ts) coordinate persisted per-user recovery. Preserve original payloads and keys across dismissal, refresh, and restart.
- [Runtime public configuration](../apps/mobile/lib/env.ts) reads bundled `EXPO_PUBLIC_*` values.

The backend supports Socket.IO, but the current mobile manifest does not declare `socket.io-client`; do not describe backend events as proof of mobile live delivery. Verify actual screen refresh/recovery behavior on the device.

Changing a user's session must not let an old request update the new user's UI or clear a newer pending money action. Review session generation, storage acknowledgment, and cache reset behavior when touching auth or money screens.

## Admin application

The admin app uses React 18, React Router, Vite, and Tailwind. [The API wrapper](../apps/admin/src/lib/api.ts) uses session storage through a dedicated session controller, removes the legacy local-storage token, and refreshes credentials through the API. Set `VITE_API_URL` explicitly for local work and at build time for deployments.

Use the existing approval-action handling for uncertain responses. A checker decision and an executed provider action are different states. Re-read approvals after interruptions instead of assuming a button response proves settlement.

The current admin package formats money locally and does not declare `@hq/shared`. Do not assume it already consumes all shared policy tables; introduce shared dependencies deliberately if needed.

## Schema changes

Edit [schema.prisma](../packages/database/prisma/schema.prisma), author a tracked migration with `pnpm db:migrate` on a development database, regenerate the client with `pnpm db:generate`, and inspect the generated SQL. Apply migrations to disposable test storage and run the CI drift check. Commit schema and migration together.

Do not use `db:push` as a deployment artifact. Do not edit a migration that has already been applied to a shared environment. Consider old/new API and worker compatibility before removing columns or changing durable JSON payload formats. See [Data model](DATA_MODEL.md).

## Extending background work

Add job behavior in [jobs.ts](../apps/api/src/modules/jobs/jobs.ts), then register its name/pattern and processor case in [queues.ts](../apps/api/src/modules/jobs/queues.ts). Use existing durable operations and state guards so retries remain safe. Document observability, recovery, cadence, and any new configuration in [Operations](OPERATIONS.md).

For a new realtime event, add its name/payload to [events.ts](../apps/api/src/realtime/events.ts), use the guarded gateway, and test both authorization and missed-signal recovery. For a new provider, use an interface, injected implementation, and deterministic fake/contract tests.
