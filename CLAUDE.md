# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HireQuick — a mobile-first staffing marketplace (Lagos event ushers) where clients book and pay for event staff, funds are held in **escrow until attendance is verified and the 72-hour dispute window closes**, and clients pay a 15% platform fee on top of agreed staff pay. This repo is a **pnpm + Turbo monorepo** with four apps: `apps/api` (the Express backend and job worker — the focus of this file), `apps/admin` (a Vite + React ops console), `apps/mobile` (an Expo React Native client/usher app), and `apps/website` (a static marketing site). The API and mobile app import money/policy helpers from `@hq/shared` so they compute identical outcomes; the admin console currently imports only shared types and Smile monitoring helpers from it.

Documentation lives in two places:

- **`documentation/`** — the canonical spec (Executive Summary, PRD, UXRD, TRD, Cost Model) plus dated deployment, validation and incident records (`*-YYYY-MM-DD.md`, `payments/`, `compliance/`, `validation-evidence/`). Code comments cite section numbers like `(TRD §6)`, `(PRD §13)` — when a comment references a section, that doc is the source of truth for the rule being implemented. Read the relevant section before changing money, escrow, policy, or state-transition logic. Dated records are historical evidence: add new ones rather than rewriting old ones.
- **`docs/`** — implementation guides checked against the source (`ARCHITECTURE`, `API`, `PAYMENTS`, `DATA_MODEL`, `TESTING`, `DEPLOYMENT`, `SMILE-ID`, `OBSERVABILITY`, …). `docs/STATUS.md` lists known gaps between spec and code. Update the affected guide in the same change that alters behavior (`docs/README.md` maps changes to guides).

## Commands

Monorepo driven by **pnpm workspaces + Turbo**. Run from the repo root unless noted.

```bash
pnpm install                  # bootstrap (Node >=22.13.0, pnpm 10.27.0; CI uses Node 22)
pnpm dev                      # run the API in watch mode (= pnpm --filter @hq/api dev)
pnpm build                    # turbo build across packages in dependency order
pnpm typecheck                # turbo typecheck (no emit)
pnpm lint                     # turbo: eslint (typescript-eslint + eslint-plugin-security)
pnpm typecheck:tests          # typecheck test sources and scripts/validation
pnpm lint:tests               # lint test sources (eslint.tests.config.mjs)
pnpm test                     # turbo: vitest run (API suite needs a disposable DB — see Testing)
pnpm docs:check               # check links in README, docs/ and the documentation/ specs
pnpm format                   # prettier --write .

pnpm mobile                   # Expo dev server (= turbo run dev --filter @hq/mobile)
pnpm --filter @hq/admin dev   # Vite dev server for the admin console
pnpm --filter @hq/website dev # marketing site on http://127.0.0.1:5174
pnpm --filter @hq/api worker  # scheduled-jobs process (BullMQ; needs REDIS_URL)

# Database (Prisma, package @hq/database)
pnpm db:generate              # prisma generate (run after schema edits)
pnpm db:push                  # prisma db push (local dev only — sync schema without a migration)
pnpm db:migrate               # prisma migrate dev (author a new tracked migration after a schema change)
pnpm db:deploy                # prisma migrate deploy (apply tracked migrations — what CI/prod run)
pnpm db:seed                  # tsx prisma/seed.ts
pnpm db:studio                # prisma studio
```

Schema changes are tracked as Prisma **migrations** under `packages/database/prisma/migrations/` (baseline `0_init`). After editing `schema.prisma`, run `pnpm db:migrate` to author a migration; CI and production apply them with `prisma migrate deploy`. `db:push` is a local-dev convenience only and must not be used to ship schema changes. Commit `schema.prisma` and its migration together — CI's drift guard fails otherwise.

Run a **single package's** tasks with a filter, e.g. `pnpm --filter @hq/api test`. Run a **single test file or test name** via vitest directly (against a disposable database — see Testing):

```bash
pnpm --filter @hq/api exec vitest run src/modules/payments/__tests__/ledger.test.ts
pnpm --filter @hq/api exec vitest run -t "rejects RELEASE on a frozen"
```

`turbo run build/typecheck/typecheck:tests/test` all `dependsOn: ["^build"]`, so dependent packages are built first automatically. `test` also requires `DATABASE_URL`/`DIRECT_URL` in the environment.

## Architecture

### Workspace layout
- **`packages/shared` (`@hq/shared`)** — pure domain logic; its only runtime dependency is `zod`. `money.ts` (branded `Kobo`, `priceBooking`, `bookingAllocation`, `splitFee`, `formatNaira`), `policy.ts` (cancellation/no-show matrix, dispute window), `state-machines.ts` (transition tables), `enums.ts`, `dto.ts` (Zod request DTOs), `checkout.ts`/`withdrawal.ts` (response schemas), `booking-flow.ts`, `observability.ts`, `smile-monitoring.ts` (fixed Smile diagnostic codes and a privacy-safe tag filter).
- **`packages/database` (`@hq/database`)** — Prisma schema (`prisma/schema.prisma`) and the generated client. **Import `prisma`, `Prisma`, and `PrismaClient` from `@hq/database`**, never from `@prisma/client` directly.
- **`packages/config` (`@hq/config`)** — shared `tsconfig.base.json`, `eslint.config.mjs`, `vitest.preset.ts`.
- **`apps/api` (`@hq/api`)** — Express (ESM) HTTP service. Feature modules under `src/modules/*`: `auth`, `events`, `bookings`, `payments`, `ushers`, `profile`, `privacy`, `notifications`, `rewards`, `storage`, `verification` (Smile ID KYC), `legal` (privacy policy and acceptance), `admin`, `jobs`, plus `audit.ts` (the hash-chained audit log; `audit/` holds its README and tests). Cross-cutting infra sits alongside `modules/`: `middleware/` (Redis rate limiting), `realtime/` (the Socket.IO `RealtimeGateway`), `observability/` (Sentry init and scrubbing, Better Stack heartbeats, readiness, the admin observability dashboard), `logger.ts` (pino — use it instead of `console.*`), `env.ts` (Zod-validated environment). Two entrypoints: `server.ts` (HTTP) and `worker.ts` (BullMQ scheduled jobs).
- **`apps/admin` (`@hq/admin`)** — Vite + React 18 operations console over the `/api/admin` surface: dashboard, verifications (Smile evidence review), disputes, two-person approvals, bookings, payment operations, ledger, users, observability. Admins sign in with an **email OTP**; the session is kept in `sessionStorage`. Errors report to Sentry via `@sentry/react`. No tests yet.
- **`apps/mobile` (`@hq/mobile`)** — Expo SDK 57 / React Native 0.86 app (`expo-router`) with `(auth)`/`(client)`/`(usher)`/`(verification)`/`(modals)` route groups. Data flows through TanStack Query hooks in `lib/hooks.ts`; UI uses `@shopify/restyle` tokens in `theme/`. It has **no Socket.IO client** — live screens poll with `refetchInterval`. Identity capture uses the Smile ID v12 SDK (`@smileid/usesmileid`). Native modules mean it needs EAS builds (`eas.json`), not Expo Go, and native changes need a new build rather than an OTA update.
- **`apps/website` (`@hq/website`)** — standalone React + Vite marketing page for `hirequick.agency`. It uses no API, database or secrets, and is deployed to Vercel by hand (see its README).

### The money/escrow core (the part that matters most)
This is a payments system; the invariants below are not optional.

- **Money is integer kobo** (`Int`, ₦1 = 100 kobo) everywhere — DB columns, code, ledger. **Never floats or `Decimal`.** Use `priceBooking` for new prices: client gross = full staff pay + floored 15% fee. `Booking.staffPay` snapshots agreed pay; `Booking.amount` includes the fee. `bookingAllocation` uses `splitFee` only for legacy rows with null `staffPay`. Fees and staff pay receive proportional cancellation refunds independently. See `documentation/payments/client-paid-fee-policy-2026-09-26.md`.
- **The ledger is append-only.** `EscrowLedger` and `WalletLedger` rows are the source of truth and are **never UPDATEd or DELETEd** — state changes are new signed entries with a denormalized `balanceAfter`.
- **`apps/api/src/modules/payments/ledger/ledger.ts` is the only code that writes the ledgers or mutates wallet balances.** Every function takes a caller-provided Prisma transaction (`Prisma.TransactionClient`) and takes `SELECT … FOR UPDATE` row locks (via `$queryRaw`, since Prisma has no native row-lock API) so escrow and wallet stay atomic under concurrency. Do not write escrow/wallet rows from anywhere else.
- **Escrow lifecycle (held-wallet model, PRD §13 hold policy):** `holdOrder` (charge confirmed → `HOLD` per booking, `Σ HOLD == order.gross`) → `completeBookingHeld` (attendance verified → booking `COMPLETED`; **no money moves**) → `releaseBooking` (only after 72 hours past event end and with no open dispute → `RELEASE` + `FEE`, booking escrow nets to 0, staff pay credited to the usher's `Wallet`; the `autocomplete` job releases bookings as their windows close) → `requestWithdrawal`/`completeWithdrawal` (the actual Paystack bank transfer happens at withdrawal, not at release). `freezeBooking`/`resolveDisputeRelease` (disputes), `cancelBooking`/`settleClientCancellation`, `refundBooking`, `markNoShow`, and `commissionSweep`/`reverseCommissionSweep` cover the other paths.
- **State machines are authoritative and enforced.** `state-machines.ts` holds `BOOKING_/ORDER_/WITHDRAWAL_/MILESTONE_TRANSITIONS`; the ledger and API call `assert*Transition` before every status change and illegal transitions throw `IllegalTransition`. Add a transition to the table before writing code that performs it.
- **Reconciliation** (`ledger/reconciliation.ts`) is the most important operational alarm: it recomputes the expected Paystack Balance from ledger aggregates and compares to the real balance (`expected = ΣHOLD + ΣREFUND + ΣCOMMISSION_SWEEP − Σ withdrawalsPaid`; RELEASE/FEE stay inside the Balance). `PROVIDER_BALANCE_EFFECT` is typed `Record<LedgerEntryType, …>`, so adding a `LedgerEntryType` forces you to decide its effect here.

### Provider boundaries (hexagonal)
- **Paystack.** All access goes through the `PaystackPort` interface (`payments/port/paystack-port.ts`). The server and worker use `HttpPaystack` (`port/http-paystack.ts`); tests inject `InMemoryPaystack` (no network, no live keys) so the ledger is fully testable. Only the **payments router and webhook** gate on the port; the **events router mounts unconditionally** and `confirm-batch` itself returns `503` when no port is present.
- **KYC.** `KycPort` (`verification/port/`) is `SmileKyc` when `KYC_MODE=smile` and the Smile settings are present, otherwise `NoopKyc`. `KYC_MODE=manual` is a staging-only document-review mode; production requires `smile` with `SMILE_ENVIRONMENT=production`. The API mints a short-lived Smile token that binds the identity fields and a per-attempt callback URL; the mobile SDK captures and submits; the callback (`/webhooks/smile-id/:referenceId/:callbackKey`) is verified and the result fetched server-side. A capture or submission never verifies an usher on its own. See `docs/SMILE-ID.md`.
- **Injection.** Ports arrive via `createApp({ paystack, paystackSecret, realtime, storage, kyc, corsOrigins, rateLimitRedis, trustProxy })` in `apps/api/src/app.ts`. Storage (S3-compatible `StoragePort`) and realtime (Socket.IO `RealtimeGateway`) are injected the same way. Each has a no-op/passthrough fallback so the app runs and tests with no external services.

### HTTP conventions (`apps/api/src/app.ts`)
- Errors are thrown as `ApiError(statusCode, code, message)` and serialized by a single error middleware into a leak-free `{ error: { code, message } }` envelope. Zod errors → `400 VALIDATION`; anything unrecognized → `500 INTERNAL` with a generic message.
- Webhooks that verify signatures (`/webhooks/paystack`, `/webhooks/smile-id`) are mounted with `express.raw` **before** `express.json`, because verification needs the raw body. `/webhooks/kudisms` (SMS delivery reports) is also mounted before `express.json`.
- **Auth.** Users sign in with phone + OTP (`/auth/otp/*`); admins sign in with an email OTP (`/auth/admin/otp/*`, `auth/admin-email-otp.ts`). JWT access/refresh via `jose`, Argon2id via `@node-rs/argon2`. `requireAuth` attaches `req.auth`; `requireRole(...)` enforces the RBAC matrix. Money-mutating endpoints require an `Idempotency-Key` header (`requireIdempotencyKey`), threaded into the ledger's idempotency layer.
- **Hardening is fail-closed.** `helmet`, a CORS allowlist, and Redis-backed rate limiters (global/auth/money tiers) wrap the app. `createApp` refuses to boot in `NODE_ENV=production` without `corsOrigins` + `rateLimitRedis`. `env.ts` additionally requires non-default JWT/OTP secrets, the Paystack secret and webhook secret, a Brevo key, storage bucket and keys, and complete Smile settings (numeric partner ID, HTTPS callback and privacy-policy URLs). Dev/test degrade to reflect-all CORS and pass-through limiters.
- **OTP and notification delivery.** `auth/otp.ts` sends through KudiSMS when it is configured, with no fallback after a KudiSMS attempt, to avoid duplicate paid sends. Otherwise it tries Twilio WhatsApp, then Brevo SMS. Brevo also sends email, and FCM HTTP v1 push lives in `notifications/brevo.ts`. Without `BREVO_API_KEY`, Brevo is stubbed to the console.
- **Realtime.** Lifecycle pushes and booking chat go through the `RealtimeGateway` (rooms `user:<id>`, `booking:<id>`, `admin:feed`). Pushes are convenience signals only: DB/ledger stay authoritative, and a client that missed one re-fetches. The mobile app currently polls instead of subscribing.
- **NDPR / audit.** `privacy` exposes data export and pseudonymizing erasure; the daily `retentionPurge` job drops transient PII (never financial/ledger rows). The audit log is hash-chained and verified by a daily `auditVerify` job. Database triggers (migration `20260927210000_preserve_audit_history`) reject `UPDATE`/`DELETE`/`TRUNCATE` on `audit_logs`.
- **Observability.** Sentry projects: `hirequick-api`, `hirequick-worker`, `hirequick-admin`, `react-native` (mobile). Events are scrubbed to fixed diagnostic codes: no messages, bodies, tokens, identity data or PII. Job heartbeats go to Better Stack. See `docs/OBSERVABILITY.md`.

### Scheduled jobs (`jobs/runtime.ts`, cron in UTC)
Every 5 min: `smileMonitoring`, `checkouts`, `storageCleanup`. Every 10 min: `autocomplete`, `noshow`. Every 15 min: `resumeOps`. Daily: `retentionPurge` 02:41, `auditVerify` 02:47, `reconcile` 03:17, `commission` 04:23. Money jobs retry durable service entrypoints, never raw provider writes.

## Conventions & gotchas

- **ESM with NodeNext resolution.** All relative imports must include the `.js` extension even though the source is `.ts` (e.g. `import { x } from './tokens.js'`). This is required, not stylistic. The mobile `metro.config.js` strips `.js` from relative imports so shared code resolves.
- **TS project references / composite builds.** Each package builds with `tsc -b`; the root `tsconfig.json` references `packages/shared`, `packages/database`, `apps/api`. After changing a package's public API, a downstream typecheck may need its dependency built first (Turbo handles this for the root scripts). `@hq/shared`'s `dist/` is gitignored, so EAS builds it in `eas-build-post-install`.
- **Two database URLs.** `DATABASE_URL` is the pooled (PgBouncer/Neon) connection used at runtime; `DIRECT_URL` is the direct connection used for migrations and concurrency tests. Copy `.env.example` → `.env` (gitignored).
- **Some constraints live only in migration SQL.** Examples are the `users_phone_or_admin_email_check` CHECK (only ADMIN accounts with an email may omit a phone) and the audit-log triggers. `schema.prisma` cannot express them and `prisma migrate diff` does not compare them, so a `db push`-built database does not have them.
- **Deployment.** API and worker ship as one Docker image (`Dockerfile`; `PROCESS_TYPE=worker` starts the worker). The admin console is `Dockerfile.admin` (static `serve`). Both run on Railway. The image does not run migrations: `migrate deploy` is a separate release step. See `docs/DEPLOYMENT.md`.
- **Paystack MCP server** is configured in `.mcp.json` (gitignored, holds a TEST key) — available for inspecting Paystack resources during development.

## Testing

- **Vitest**, files named `*.test.ts` (and `__tests__/**/*.test.ts`). API tests are **DB-backed** and hit a real Postgres (an ephemeral `postgres:16` service in CI).
- **The API suite only runs against a disposable database.** Vitest global setup (`apps/api/src/modules/auth/__tests__/database-setup.ts`) refuses to load any test file unless `DATABASE_URL` names a generated `hq_validation_<14 digits>_<8 hex>` schema, or `CI=true` with a local database named `hirequick_test`. Never point tests at a shared or development database, and never bypass the guard. Use `node scripts/validation/isolated-payments.mjs --run` (creates, migrates and cleans up a validation schema) or the local-Postgres recipe in `docs/TESTING.md`.
- API tests run **serially** (`fileParallelism: false`, `singleFork`) with a 120s test/hook timeout, because suites share one database and the reconciliation test reads global ledger aggregates — parallel runs would see each other's rows. Concurrency tests (`payments/__tests__/concurrency.test.ts`) deliberately open their own connections to exercise the `FOR UPDATE` locks.
- Mobile tests are Vitest in a node environment over `apps/mobile/lib/__tests__` (no component tests). `packages/shared` has unit tests; the admin console and website have none.
- CI (`.github/workflows/ci.yml`) runs: install → `redis-server` → `prisma generate` → `docs:check` → `typecheck` → `lint` → `typecheck:tests` → `lint:tests` → `prisma migrate deploy` → migration-drift guard (`prisma migrate diff --from-url … --to-schema-datamodel … --exit-code`) → `test` → `isolated-payments.mjs --local-lifecycle-only`. Match that order when reproducing CI locally.
