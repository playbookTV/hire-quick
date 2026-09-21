# HireQuick

HireQuick is a mobile-first staffing marketplace for event ushers. Clients create events, select staff, and pay for a batch of bookings. Verified work releases earnings into the usher's wallet; withdrawal to a bank is a separate action. The platform fee is 15%.

This pnpm/Turbo monorepo contains the Express API and background worker, a React operations console, and an Expo React Native mobile app.

## Start here

- **New contributor:** follow [Local setup](docs/GETTING_STARTED.md), then [Development](docs/DEVELOPMENT.md).
- **Understand the system:** read [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), and [Payments](docs/PAYMENTS.md).
- **Build an integration:** use the [API reference](docs/API.md) and [Application workflows](docs/WORKFLOWS.md).
- **Test or release:** follow [Testing](docs/TESTING.md), [Deployment](docs/DEPLOYMENT.md), and [Operations](docs/OPERATIONS.md).
- **Find any document:** open the [documentation index](docs/README.md).

## Local setup overview

Use Node **22.13 or newer** (CI and containers use Node 22), pnpm **10.27.0**, PostgreSQL, and Redis. The mobile app uses **Expo SDK 57** and needs a matching version of Expo Go. Run commands from the repository root.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit `.env` for your own development database, Redis, and nonempty JWT secrets. Then export that file in each API/database terminal; package commands run from their own directories, so do not rely on root `.env` auto-discovery:

```sh
set -a
. ./.env
set +a
pnpm db:generate
pnpm --filter @hq/api build
pnpm db:deploy
pnpm dev
```

`GET http://localhost:4000/health` returns `{"status":"ok"}`. This confirms HTTP liveness, not dependency health. See [Local setup](docs/GETTING_STARTED.md) for service containers, app configuration, seed limitations, and login.

The normal server uses real Redis and `HttpPaystack`. Test fakes are injected by tests; an empty Paystack key does not switch the server to a fake. Development login requires configured OTP delivery; only isolated `NODE_ENV=test` requests receive `devCode`.

## Repository map

| Path                                       | Purpose                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`apps/api`](apps/api)                     | Express API, payment orchestration, scheduled jobs, realtime authorization         |
| [`apps/admin`](apps/admin)                 | Vite/React operations console                                                      |
| [`apps/mobile`](apps/mobile)               | Expo client and usher experiences                                                  |
| [`packages/shared`](packages/shared)       | Money, policy, state transitions, enums, Zod contracts                             |
| [`packages/database`](packages/database)   | Prisma client, schema, tracked migrations, development seeds                       |
| [`packages/config`](packages/config)       | TypeScript, lint, and test configuration                                           |
| [`docs`](docs/README.md)                   | Maintained implementation and operating guides                                     |
| [`documentation`](documentation/README.md) | Product requirements, technical specifications, compliance records, dated evidence |

## Commands

| Command                                                          | Purpose                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                                                       | API with file watching                                                                |
| `pnpm --filter @hq/api worker`                                   | Background jobs with file watching                                                    |
| `VITE_API_URL=http://localhost:4000 pnpm --filter @hq/admin dev` | Local admin on port 5173                                                              |
| `pnpm mobile`                                                    | Expo development server; configure the mobile `.env` first                            |
| `pnpm build`                                                     | Workspace builds, including mobile asset export                                       |
| `pnpm typecheck` / `pnpm lint`                                   | Application/package checks                                                            |
| `pnpm typecheck:tests` / `pnpm lint:tests`                       | Test-source checks                                                                    |
| `pnpm test`                                                      | Workspace suites; use an isolated database as described in [Testing](docs/TESTING.md) |
| `pnpm docs:check`                                                | Check maintained documentation links                                                  |

## Engineering invariants

Money uses integer kobo. Ledgers are append-only, and the ledger engine owns balance writes. State-machine guards, transaction locks, durable provider intents, and reconciliation protect retry and concurrency behavior. Read [Payments](docs/PAYMENTS.md) before changing financial behavior.

Product intent and implemented behavior are documented separately. Known limitations—including late cancellation settlement and post-payout disputes—are listed in [Current status](docs/STATUS.md). Historical validation is evidence for its recorded revision, not a guarantee about the current checkout.

See [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md) for change and reporting practices.
