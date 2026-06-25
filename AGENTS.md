# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

HireQuick — a mobile-first staffing marketplace (Lagos event ushers) where clients book and pay for event staff, funds are held in **escrow until verified attendance**, and the platform takes a 15% commission. This repo is a **pnpm + Turbo monorepo** with three apps: `apps/api` (the Express backend — the focus of this file), `apps/admin` (a Vite + React ops console), and `apps/mobile` (an Expo React Native client/usher app). The mobile and admin apps import `@hq/shared` so every surface computes identical money/policy outcomes.

The canonical spec lives in `documentation/` (Executive Summary, PRD, UXRD, TRD). Code comments cite section numbers like `(TRD §6)`, `(PRD §13)` — when a comment references a section, that doc is the source of truth for the rule being implemented. Read the relevant section before changing money, escrow, policy, or state-transition logic.

## Commands

Monorepo driven by **pnpm workspaces + Turbo**. Run from the repo root unless noted.

```bash
pnpm install                 # bootstrap (Node >=20, pnpm 10.27.0)
pnpm dev                     # run the API in watch mode (= pnpm --filter @hq/api dev)
pnpm build                   # turbo: tsc -b across packages in dependency order
pnpm typecheck               # turbo: tsc -b (no emit check)
pnpm lint                    # turbo: eslint (typescript-eslint + eslint-plugin-security)
pnpm test                    # turbo: vitest run (DB-backed — see Testing)
pnpm format                  # prettier --write .

pnpm mobile                  # Expo dev server (= turbo run dev --filter @hq/mobile)
pnpm --filter @hq/admin dev  # Vite dev server for the admin console
pnpm --filter @hq/api worker # scheduled-jobs process (BullMQ; needs REDIS_URL)

# Database (Prisma, package @hq/database)
pnpm db:generate             # prisma generate (run after schema edits)
pnpm db:push                 # prisma db push (sync schema without a migration)
pnpm db:migrate              # prisma migrate dev
pnpm db:seed                 # tsx prisma/seed.ts
pnpm db:studio               # prisma studio
```

Run a **single package's** tasks with a filter, e.g. `pnpm --filter @hq/api test`. Run a **single test file or test name** via vitest directly:

```bash
pnpm --filter @hq/api exec vitest run src/modules/payments/__tests__/ledger.test.ts
pnpm --filter @hq/api exec vitest run -t "holds the full order amount"
```

`turbo run build/typecheck/test` all `dependsOn: ["^build"]`, so dependent packages are built first automatically. `test` also requires `DATABASE_URL`/`DIRECT_URL` in the environment.

## Architecture

### Workspace layout
- **`packages/shared` (`@hq/shared`)** — pure, dependency-free domain logic: `money.ts` (kobo + fee math), `policy.ts` (cancellation/no-show matrix), `state-machines.ts` (transition tables), `enums.ts`, `dto.ts` (Zod DTOs). Imported by everything; the mobile and admin apps import the same matrices so all surfaces compute identical outcomes.
- **`packages/database` (`@hq/database`)** — Prisma schema (`prisma/schema.prisma`) and the generated client. **Import `prisma`, `Prisma`, and `PrismaClient` from `@hq/database`**, never from `@prisma/client` directly.
- **`packages/config` (`@hq/config`)** — shared `tsconfig.base.json`, `eslint.config.mjs`, `vitest.preset.ts`.
- **`apps/api` (`@hq/api`)** — Express (ESM) HTTP service. Feature modules under `src/modules/*` (`auth`, `events`, `bookings`, `payments`, `ushers`, `profile`, `privacy`, `notifications`, `rewards`, `storage`, `admin`, `jobs`, `audit`). Cross-cutting infra sits alongside `modules/`: `middleware/` (Redis rate limiting), `realtime/` (the Socket.IO `RealtimeGateway`), `logger.ts`. Two entrypoints: `server.ts` (HTTP) and `worker.ts` (BullMQ scheduled jobs).
- **`apps/admin` (`@hq/admin`)** — Vite + React 18 operations console (verifications, disputes, refunds, two-person approvals, ledger, stats) over the `/api/admin` surface.
- **`apps/mobile` (`@hq/mobile`)** — Expo React Native app (`expo-router`) with `(auth)`/`(client)`/`(usher)`/`(verification)`/`(modals)` route groups; talks to the API over HTTP + Socket.IO.

### The money/escrow core (the part that matters most)
This is a payments system; the invariants below are not optional.

- **Money is integer kobo** (`Int`, ₦1 = 100 kobo) everywhere — DB columns, code, ledger. **Never floats or `Decimal`.** Use the helpers in `@hq/shared/money` (`kobo`, `naira`, `splitFee`, `pctOf`). `splitFee` floors the fee and gives the payout the exact remainder so `fee + payout === gross` with no rounding leak.
- **The ledger is append-only.** `EscrowLedger` and `WalletLedger` rows are the source of truth and are **never UPDATEd or DELETEd** — state changes are new signed entries with a denormalized `balanceAfter`.
- **`apps/api/src/modules/payments/ledger/ledger.ts` is the only code that writes the ledgers or mutates wallet balances.** Every function takes a caller-provided Prisma transaction (`Prisma.TransactionClient`) and takes `SELECT … FOR UPDATE` row locks (via `$queryRaw`, since Prisma has no native row-lock API) so escrow and wallet stay atomic under concurrency. Do not write escrow/wallet rows from anywhere else.
- **Escrow lifecycle (v2.1 held-wallet model):** `holdOrder` (charge confirmed → `HOLD` per booking, `Σ HOLD == order.gross`) → `releaseBooking` (attendance verified → `RELEASE` + `FEE`, booking escrow nets to 0, payout credited to the usher's `Wallet`) → `requestWithdrawal`/`completeWithdrawal` (the actual Paystack bank transfer happens at withdrawal, not at release). `freezeBooking` (dispute), `refundBooking`, `markNoShow`, `commissionSweep` cover the other paths.
- **State machines are authoritative and enforced.** `state-machines.ts` holds `BOOKING_/ORDER_/WITHDRAWAL_TRANSITIONS`; the ledger and API call `assert*Transition` before every status change and illegal transitions throw `IllegalTransition`. Add a transition to the table before writing code that performs it.
- **Reconciliation** (`ledger/reconciliation.ts`) is the most important operational alarm: it recomputes the expected Paystack Balance from ledger aggregates and compares to the real balance (`expected = ΣHOLD + ΣREFUND + ΣCOMMISSION_SWEEP − Σ withdrawalsPaid`; RELEASE/FEE stay inside the Balance). Keep this formula in sync with any new `LedgerEntryType`.

### Paystack boundary (hexagonal)
All Paystack access goes through the `PaystackPort` interface (`payments/port/paystack-port.ts`). Phase 1 uses `InMemoryPaystack` (no network, no live keys) so the ledger is fully testable; the HTTP implementation against TEST keys is Phase 2. The app receives the port via dependency injection: `createApp({ paystack, paystackSecret, realtime, storage, corsOrigins, rateLimitRedis, trustProxy })` in `apps/api/src/app.ts`. Only the **payments router and webhook** gate on the port; the **events router now mounts unconditionally** and `confirm-batch` itself returns `503` when no port is present. Storage (S3 `StoragePort`) and realtime (Socket.IO `RealtimeGateway`) are injected the same way, each with a no-op/passthrough fallback so the app runs and tests with no external services.

### HTTP conventions (`apps/api/src/app.ts`)
- Errors are thrown as `ApiError(statusCode, code, message)` and serialized by a single error middleware into a leak-free `{ error: { code, message } }` envelope. Zod errors → `400 VALIDATION`; anything unrecognized → `500 INTERNAL` with a generic message.
- The Paystack webhook is mounted with `express.raw` **before** `express.json`, because signature verification needs the raw body.
- Auth: phone + OTP, JWT access/refresh via `jose`, Argon2id via `@node-rs/argon2`. `requireAuth` attaches `req.auth`; `requireRole(...)` enforces the RBAC matrix. Money-mutating endpoints require an `Idempotency-Key` header (`requireIdempotencyKey`), threaded into the ledger's idempotency layer.
- **Hardening is fail-closed.** `helmet`, a CORS allowlist, and Redis-backed rate limiters (global/auth/money tiers) wrap the app. `createApp` refuses to boot in `NODE_ENV=production` without `corsOrigins` + `rateLimitRedis`; `env.ts` additionally requires strong JWT secrets, Paystack keys, a Brevo key, and a storage bucket. Dev/test degrade to reflect-all CORS and pass-through limiters.
- **Realtime & notifications.** Lifecycle pushes and booking chat go through the `RealtimeGateway` (rooms `user:<id>`, `booking:<id>`, `admin:feed`); pushes are convenience signals only — DB/ledger stay authoritative, a client that missed one re-fetches. OTP/notification delivery is Brevo (WhatsApp OTP primary, SMS/email), stubbed to the console without `BREVO_API_KEY`.
- **NDPR / audit.** `privacy` exposes data export + pseudonymizing erasure; the daily `retentionPurge` job drops transient PII (never financial/ledger rows). The audit log is hash-chained and verified by a daily `auditVerify` job.

## Conventions & gotchas

- **ESM with NodeNext resolution.** All relative imports must include the `.js` extension even though the source is `.ts` (e.g. `import { x } from './tokens.js'`). This is required, not stylistic.
- **TS project references / composite builds.** Each package builds with `tsc -b`; the root `tsconfig.json` references `packages/shared`, `packages/database`, `apps/api`. After changing a package's public API, a downstream typecheck may need its dependency built first (Turbo handles this for the root scripts).
- **Two database URLs.** `DATABASE_URL` is the pooled (PgBouncer/Neon) connection used at runtime; `DIRECT_URL` is the direct connection used for migrations and concurrency tests. Copy `.env.example` → `.env` (gitignored).
- **Paystack MCP server** is configured in `.mcp.json` (gitignored, holds a TEST key) — available for inspecting Paystack resources during development.

## Testing

- **Vitest**, files named `*.test.ts` (and `__tests__/**/*.test.ts`). Tests are **DB-backed** and hit a real Postgres (Neon locally via `.env`; an ephemeral `postgres:16` service in CI).
- They run **serially** (`fileParallelism: false`, `singleFork`) with a 60s timeout because suites share one database and the reconciliation test reads global ledger aggregates — parallel runs would see each other's rows. Concurrency tests (`payments/__tests__/concurrency.test.ts`) deliberately open their own connections to exercise the `FOR UPDATE` locks.
- CI (`.github/workflows/ci.yml`) runs: install → `prisma generate` → `typecheck` → `lint` → `prisma db push` → `test`. Match that order when reproducing CI locally.
