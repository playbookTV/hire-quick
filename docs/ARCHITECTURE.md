# Architecture Overview

This document explains how the HireQuick backend is put together: the workspace
layout, how a request flows through the system, the key design decisions, and
where to extend it. For the money/escrow internals, see
[`PAYMENTS.md`](./PAYMENTS.md). For endpoints, see [`API.md`](./API.md).

---

## System design

HireQuick is a **pnpm + Turbo monorepo**. There is one runtime application today
(`apps/api`, an Express HTTP service) plus a separate **worker** process for
scheduled jobs. Both lean on three shared packages.

```
                         ┌─────────────────────────────────────────┐
                         │            packages/shared (@hq/shared)   │
                         │  pure, dependency-free domain logic:      │
                         │  money · policy · state-machines · enums  │
                         │  · dto (Zod)                              │
                         └───────────────┬───────────────────────────┘
                                         │ imported by everything
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                 │                                 │
┌───────▼─────────┐              ┌────────▼──────────┐            ┌─────────▼────────┐
│ apps/api        │              │ packages/database │            │ (future)         │
│ @hq/api         │   uses       │ @hq/database      │            │ mobile / admin   │
│ Express service │─────────────▶│ Prisma client +   │            │ apps — will      │
│ + worker        │   prisma     │ schema (Postgres) │            │ import @hq/shared│
└───────┬─────────┘              └───────────────────┘            └──────────────────┘
        │ port
┌───────▼──────────────┐
│ Paystack             │
│ (HttpPaystack live   │
│  TEST / InMemory fake)│
└──────────────────────┘
```

Why a monorepo with a `shared` package? The policy matrix, money math, and state
machines must produce **identical outcomes** on every surface. When the mobile
and admin apps arrive, they import the same `@hq/shared` matrices instead of
re-implementing them, so a refund computed in the app equals the refund computed
by the ledger.

---

## Workspace layout

### `packages/shared` (`@hq/shared`)

Pure domain logic with **no runtime dependencies** (except Zod). Imported by
everything.

| File | Responsibility |
| --- | --- |
| `money.ts` | `Kobo` branded type, `kobo`/`naira`/`addKobo`/`sumKobo`, `splitFee` (15% fee math with no rounding leak), `formatNaira`. `PLATFORM_FEE_BPS = 1500`. |
| `policy.ts` | Cancellation / no-show / dispute outcome matrix (refund %, payout %, reputation effect). Single source of truth (PRD §13). |
| `state-machines.ts` | `BOOKING_TRANSITIONS`, `ORDER_TRANSITIONS`, `WITHDRAWAL_TRANSITIONS` tables + `assert*Transition` guards that throw `IllegalTransition`. Plus the UX-label → DB-enum map. |
| `enums.ts` | Canonical domain enums (roles, statuses, ledger entry types). Prisma mirrors these. |
| `dto.ts` | Zod request validators for boundary validation. |

### `packages/database` (`@hq/database`)

The Prisma schema (`prisma/schema.prisma`) and the generated client. **Always
import `prisma`, `Prisma`, `PrismaClient` from `@hq/database`** — never from
`@prisma/client` directly. The package exports a process-wide singleton so hot
reloads don't exhaust the Neon connection pool.

### `packages/config` (`@hq/config`)

Shared `tsconfig.base.json`, `eslint.config.mjs`, and `vitest.preset.ts` consumed
by the other packages.

### `apps/api` (`@hq/api`)

The Express (ESM) HTTP service. Feature modules live under `src/modules/*`:
`auth`, `events`, `bookings`, `payments`, `profile`, `admin`, `jobs`, plus
`audit.ts`. Two entrypoints:

- `server.ts` — the HTTP API (`pnpm dev` / `pnpm --filter @hq/api start`).
- `worker.ts` — the scheduled-jobs process (`pnpm --filter @hq/api worker`).

---

## Request flow

### How the Express app is assembled (`apps/api/src/app.ts`)

`createApp(config)` builds the app in a deliberate order:

```
1. helmet() + cors()                         security headers
2. x-request-id middleware                    request correlation
3. /webhooks/paystack  (express.raw)          ← mounted BEFORE express.json,
                                                 because HMAC verification needs
                                                 the raw body
4. express.json({ limit: '1mb' })             body parsing for everything else
5. /health                                    liveness
6. /auth, /api/me, /api/admin, /api           feature routers
7. /api/payments, /api (events)               mounted only when a Paystack port
                                                 is provided (see DI below)
8. 404 handler                                { error: { code, message } }
9. error middleware                           Zod → 400 VALIDATION;
                                                 ApiError → its status/code;
                                                 anything else → 500 INTERNAL
                                                 (generic, leak-free message)
```

`createApp` takes its dependencies as config (`{ paystack, paystackSecret }`),
so tests can pass an in-memory Paystack and the payments routes mount only when a
port is present. `server.ts` is the production wiring that injects the real
`HttpPaystack`.

### Example: a client confirms a batch of ushers

```
POST /api/events/:id/confirm   (Idempotency-Key required)
        │
[1] events/routes.ts        requireAuth → Zod-validate { applicationIds, email }
        ▼
[2] bookings/service.ts     confirmBatch():
        │                     - verify the event belongs to this client
        │                     - load ACCEPTED applications
        │                     - in one DB tx: create Order (PENDING) + Bookings
        │                       (PENDING_PAYMENT), gross = budgetPerHead × N
        ▼
[3] payments/service.ts     initChargeForOrder() → Paystack.initializeCharge()
        ▼
[4] response                { orderId, authorizationUrl, reference, bookingIds }
        │                   (client opens authorizationUrl to pay)
        ▼
[5] Paystack → webhook      charge.success → holdOrder() moves the order to PAID
                            and HOLDs each booking's amount into escrow
```

The money never moves to anyone here — it lands in the platform's Paystack
Balance and is recorded as `HOLD` ledger entries. Release happens later, on
verified attendance. The full money lifecycle is in [`PAYMENTS.md`](./PAYMENTS.md).

---

## Data model (high level)

The schema (`packages/database/prisma/schema.prisma`) groups into:

- **Identity:** `User` (role CLIENT/USHER/ADMIN, phone-unique), `Client`,
  `Usher` (+ `UsherVerification`, `Photo`, `Availability`), `BankAccount`,
  `VerificationCode` (OTP + attendance codes).
- **Marketplace:** `Event`, `Application`, `Invitation`.
- **Booking & money:** `Order` (a confirmed batch), `Booking` (one usher on one
  event), `Payment` (gross/fee/payout + escrow status), `Wallet`, `Withdrawal`.
- **Ledgers (append-only):** `EscrowLedger`, `WalletLedger` — never UPDATE/DELETE.
- **Ops & social:** `Dispute`, `Conversation`/`Message`, `Review`, `AuditLog`,
  `IdempotencyKey`, `Device`.

Everything monetary is `Int` (kobo). Timestamps are `Timestamptz(6)`.

---

## Key design decisions

### Money is integer kobo, never floats

**Decision:** every amount in the DB, the code, and the ledger is an integer
number of kobo (₦1 = 100 kobo). **Why:** floating-point drift would silently
break the per-booking `Σ == 0` ledger invariant. **Trade-off:** all arithmetic
goes through `@hq/shared/money` helpers; `splitFee` floors the fee and gives the
payout the exact remainder so `fee + payout === gross` always.

### The ledger is append-only and authoritative

**Decision:** `EscrowLedger` and `WalletLedger` rows are immutable; balances are
derived by summing them. State transitions are validated against transition
tables. **Why:** an auditable, replayable record of every movement, and the
ability to reconcile against the real Paystack balance. **Trade-off:** more rows
and more discipline (you add a transition to the table before writing code that
performs it).

### Paystack behind a hexagonal port

**Decision:** all Paystack calls go through the `PaystackPort` interface. Phase 1
ships an `InMemoryPaystack` (no network, no live keys); Phase 2 adds
`HttpPaystack` against TEST keys behind the same interface. **Why:** the ledger
is fully testable with no external dependency, and the app receives the port via
DI. **Trade-off:** an extra abstraction layer, justified by test isolation.

### Webhooks are the source of truth for money state

**Decision:** the API initiates a charge, but the **HOLD into escrow happens on
the verified `charge.success` webhook**, not on the API response. **Why:** the
client could abandon the hosted checkout; only the webhook proves payment.
**Trade-off:** money state is eventually consistent with the API call, mediated
by Paystack's at-least-once delivery (hence idempotent dedupe).

### Stateless JWTs + idempotency keys

Auth is phone + OTP, issuing short-lived access JWTs and rotating refresh tokens
(`jose`, HS256). Logout is a client-side discard today (a refresh denylist is a
documented Phase 9 item). Money-mutating endpoints require an `Idempotency-Key`
header, threaded into the ledger's idempotency layer so retries are safe.

---

## Concurrency & transactions

Ledger mutations run inside a caller-provided Prisma transaction and take
**row-level locks** via raw `SELECT … FOR UPDATE` (Prisma has no native row-lock
API). This makes escrow and wallet updates atomic and safe under concurrent
requests — e.g. two simultaneous withdrawals of the same balance: exactly one
succeeds. See [`PAYMENTS.md`](./PAYMENTS.md#concurrency) and
`payments/__tests__/concurrency.test.ts`.

---

## Scheduled jobs

The worker process (`worker.ts`) registers BullMQ repeatable jobs
(`jobs/queues.ts`) on cron patterns; the job bodies (`jobs/jobs.ts`) are thin
wrappers over already-tested service functions:

| Job | Cron | What it does |
| --- | --- | --- |
| `autocomplete` | `*/10 * * * *` | Release payout for checked-in/arrived bookings past `eventEnd + grace` (D1). |
| `noshow` | `3-59/10 * * * *` | Refund the client + penalize the usher for confirmed-but-absent bookings past `start + grace`. |
| `reconcile` | `17 3 * * *` | Compare ledger-expected vs real Paystack balance; raise the alarm on drift or stale holds (§17). |
| `commission` | `23 4 * * *` | Sweep accumulated platform fees to the operating bank account (D3). |
| `transferRetry` | `*/30 * * * *` | Surface withdrawals stuck in `PROCESSING` >30 min for ops follow-up. |

Cron minutes are deliberately off-zero so many deployments don't all hit
Paystack/Neon on the same tick.

---

## Testing strategy

- **Vitest**, files named `*.test.ts` / `__tests__/**/*.test.ts`.
- Tests are **DB-backed** — they hit a real Postgres (Neon locally via `.env`;
  ephemeral `postgres:16` in CI), not mocks.
- They run **serially** (`fileParallelism: false`, single fork, 60s timeout)
  because suites share one database and the reconciliation test reads global
  ledger aggregates — parallel runs would see each other's rows.
- Concurrency tests open their own connections to exercise `FOR UPDATE` locks.
- CI (`.github/workflows/ci.yml`): install → `prisma generate` → `typecheck` →
  `lint` → `prisma db push` → `test`. Reproduce CI locally by matching that order.

---

## Extension points

- **New endpoint:** add a module under `apps/api/src/modules/`, export a router,
  mount it in `app.ts`. Validate input with a Zod DTO in `@hq/shared/dto`.
- **New money movement:** add the transition to the relevant table in
  `@hq/shared/state-machines` **first**, add a `LedgerEntryType` if needed, then
  write the ledger function — and update the reconciliation formula if the entry
  affects the Paystack Balance (see [`PAYMENTS.md`](./PAYMENTS.md#reconciliation)).
- **Real SMS / storage:** swap the dev OTP logger for an SMS provider
  (`auth/otp.ts`) and replace the stubbed signed-URL handling in
  `profile/routes.ts`.
- **New scheduled job:** add a function to `jobs/jobs.ts` and a `SCHEDULES` entry
  + `case` in `jobs/queues.ts`.
