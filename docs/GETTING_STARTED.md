# Local setup

[Documentation index](README.md) · [Configuration](CONFIGURATION.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Prerequisites

Use Node **22**, pnpm **10.27.0**, PostgreSQL **16** (the CI version), and Redis. Docker is optional for local services. Native mobile testing also needs a compatible simulator/emulator or physical device and the Expo development environment.

The package minimum is Node 20. If your Node installation includes Corepack, `corepack enable` and `corepack prepare pnpm@10.27.0 --activate` select the pinned package manager. Confirm with `node --version` and `pnpm --version`.

All commands below run from the repository root unless stated otherwise. Choose a database dedicated to development. Integration tests need separate disposable storage; see [Testing](TESTING.md).

## 1. Start local services

If you already have dedicated PostgreSQL and Redis instances, use their URLs. Otherwise these optional containers expose services only on loopback:

```sh
docker run --name hq-dev-postgres -d \
  -e POSTGRES_USER=hq -e POSTGRES_PASSWORD=hq_local_only \
  -e POSTGRES_DB=hirequick_dev \
  -p 127.0.0.1:5432:5432 postgres:16
docker run --name hq-dev-redis -d \
  -p 127.0.0.1:6379:6379 redis:7-alpine
```

Check PostgreSQL readiness with `docker exec hq-dev-postgres pg_isready -U hq -d hirequick_dev`. Use `docker start hq-dev-postgres hq-dev-redis` on subsequent sessions. These commands do not configure a named backup volume; removing the database container discards its data.

## 2. Install and configure

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Edit the copied file. For the containers above, set:

```dotenv
DATABASE_URL="postgresql://hq:hq_local_only@localhost:5432/hirequick_dev"
DIRECT_URL="postgresql://hq:hq_local_only@localhost:5432/hirequick_dev"
NODE_ENV="development"
REDIS_URL="redis://127.0.0.1:6379"
JWT_ACCESS_SECRET="dev-local-access-change-before-deployment"
JWT_REFRESH_SECRET="dev-local-refresh-change-before-deployment"
PAYSTACK_SECRET_KEY=""
```

These credentials are local examples only. Nonempty JWT secrets are necessary: the schema supplies defaults for absent variables, but rejects explicitly empty JWT values. Configure TEST Paystack credentials for payment integration and Brevo for actual login delivery. Read [Configuration](CONFIGURATION.md) for every supported variable.

## 3. Load environment and initialize

The API imports `dotenv/config`, which resolves `.env` relative to the process working directory. pnpm filtered commands run in package directories. Explicitly export the trusted local `.env` in each API/database terminal:

```sh
set -a
. ./.env
set +a
pnpm db:generate
pnpm --filter @hq/api build
pnpm db:deploy
```

The API TypeScript build also builds its referenced shared/database packages. Applying tracked migrations is the default bootstrap path. `pnpm db:push` is only for disposable local experiments; it does not create a migration for review or deployment.

An optional development seed is available:

```sh
pnpm db:seed
```

[The seed](../packages/database/prisma/seed.ts) creates these synthetic identities:

| Phone            | Role                       |
| ---------------- | -------------------------- |
| `+2348000000001` | ADMIN                      |
| `+2348000000002` | CLIENT                     |
| `+2348000000003` | Verified USHER with wallet |

User and reward-tier inserts are upserts, but the event insert is unconditional. Repeated seeding creates additional events. The sample event date is **2026-08-15**; create a future event for interactive booking tests. The placeholder password hash is not a login password. These phone numbers are fixtures, not a way to receive an SMS. Use isolated auth tests or an appropriately provisioned account with a reachable phone for interactive login. Never seed production with this script.

## 4. Start API and worker

```sh
pnpm dev
```

In another terminal, export the same `.env`, then:

```sh
pnpm --filter @hq/api worker
```

The worker performs checkout/payment recovery, attendance sweeps, reconciliation, retention, and audit checks. Without it, HTTP can respond while scheduled work remains unprocessed.

```sh
curl --fail http://localhost:4000/health
```

Expected response: `{"status":"ok"}`. This is a liveness route; it does not query PostgreSQL, Redis, or a provider.

## 5. Start the admin console

```sh
VITE_API_URL=http://localhost:4000 pnpm --filter @hq/admin dev
```

Open `http://localhost:5173`. Always set the API URL for local work: the current admin fallback points to a deployed Railway API. There is no Vite proxy in the checked-in configuration. If a CORS allowlist is set, include `http://localhost:5173`.

Admin uses phone OTP and requires an existing ADMIN account. Public signup permits only CLIENT and USHER.

## 6. Start mobile

```sh
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @hq/shared build
pnpm mobile
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`:

| Target                          | Local API URL                   |
| ------------------------------- | ------------------------------- |
| iOS simulator                   | `http://localhost:4000`         |
| Android emulator                | `http://10.0.2.2:4000`          |
| Physical device on the same LAN | `http://<computer-LAN-IP>:4000` |

For a physical device, allow inbound connections to the API port on your development machine. Restart Expo after changing public environment variables. Public variables are bundled into the app and must never contain secrets.

## 7. Verify a useful development session

Confirm HTTP liveness, worker startup, and that both clients point at your intended API. Request OTP only with a reachable development account and configured delivery. Create a future event including accommodation disclosure if it ends at or after 22:00. Exercise payment behavior with test fixtures/fakes or TEST provider credentials, following [Workflows](WORKFLOWS.md).

The ordinary development server does not fall back to `InMemoryPaystack`, and no-key development login does not expose an OTP. Use [Testing](TESTING.md) for isolated backend flows without provider delivery.
