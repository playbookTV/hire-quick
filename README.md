# HireQuick — Backend

> Mobile-first staffing marketplace for Lagos event ushers. Clients book and pay
> event staff; funds are held in **escrow until verified attendance**; the
> platform takes a **15% commission**.

This repository is a **pnpm + Turbo monorepo** with three apps: the **`apps/api`**
backend (Express), an **`apps/admin`** operations console (Vite + React), and the
**`apps/mobile`** client/usher app (Expo React Native). The backend is the centre
of gravity and the focus of this documentation. The canonical product and
technical specs live in [`documentation/`](./documentation) (Executive Summary,
PRD, UXRD, TRD). Code comments cite section numbers like `(TRD §6)` or
`(PRD §13)`; when they do, **the doc is the source of truth** — read the
referenced section before changing money, escrow, policy, or state-transition
logic.

---

## What this does

A client posts an **event** that needs staff (e.g. 10 ushers for a wedding).
Ushers **apply** or are **invited**. The client **confirms a batch** of accepted
ushers, which creates an **order** and **pays once** through Paystack. That money
is **held in escrow** — not paid to anyone — until each usher's attendance is
verified at the event. On verified completion, the usher's share (gross − 15%
fee) is **released into their wallet**, from which they can **withdraw** to a
bank account. If an usher no-shows or a booking is cancelled, the client is
**refunded** per the [cancellation policy matrix](./docs/PAYMENTS.md#policy-matrix).

The entire flow is governed by an **append-only ledger** that must always balance
to zero per booking, and a daily **reconciliation** job that compares the ledger
against the real Paystack balance. This is the heart of the system — see
[`docs/PAYMENTS.md`](./docs/PAYMENTS.md).

---

## Quick start (under 5 minutes)

**Prerequisites:** Node `>= 20`, `pnpm@10.27.0`, and a PostgreSQL database
(Neon free tier works; CI uses an ephemeral `postgres:16`).

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp .env.example .env
#    Fill in DATABASE_URL + DIRECT_URL (on Neon: DIRECT_URL is the
#    DATABASE_URL host with "-pooler" removed). Set JWT secrets for non-dev.
#    The external services (Redis, Brevo, S3 storage, Paystack) are OPTIONAL in
#    dev — without their env vars the app degrades to safe stubs (OTPs log to
#    the console, rate limiters pass through, storage falls back to plain URLs).
#    Production refuses to boot without them (see env.ts).

# 3. Create the schema + seed a demo client/usher/admin/event
pnpm db:push
pnpm db:seed

# 4. Run the API in watch mode (http://localhost:4000)
pnpm dev

# 5. Smoke test
curl http://localhost:4000/health      # → { "status": "ok", "service": "hirequick-api" }
```

To exercise the full booking → escrow → payout flow without any live keys, run
the test suite (it is DB-backed and uses an in-memory Paystack fake):

```bash
pnpm test
```

The other apps:

```bash
pnpm mobile                  # Expo dev server for apps/mobile (RN client/usher app)
pnpm --filter @hq/admin dev  # Vite dev server for apps/admin (ops console)
```

---

## Project structure

```
hire-quick/
├── apps/
│   ├── api/                      # @hq/api — Express HTTP service (the backend)
│   │   └── src/
│   │       ├── app.ts            # createApp(): middleware, routers, error envelope
│   │       ├── server.ts         # HTTP entrypoint (wires Paystack, Redis, storage, sockets)
│   │       ├── worker.ts         # Scheduled-jobs entrypoint (BullMQ)
│   │       ├── env.ts            # Zod-validated environment (fail-closed in prod)
│   │       ├── logger.ts         # structured (pino) logger
│   │       ├── middleware/       # rate limiting (global / auth / money tiers)
│   │       ├── realtime/         # Socket.IO gateway — chat + lifecycle pushes
│   │       └── modules/
│   │           ├── auth/         # phone-OTP login, JWT, RBAC middleware
│   │           ├── events/       # events, applications, invitations, saved jobs, confirm-batch
│   │           ├── bookings/     # booking lifecycle, attendance, disputes, reviews, chat
│   │           ├── payments/     # ★ ledger, reconciliation, Paystack port, webhook
│   │           ├── ushers/       # usher discovery + public profile/reviews
│   │           ├── profile/      # profile, photos, availability, devices, KYC submission
│   │           ├── privacy/      # NDPR data export + erasure (data-subject rights)
│   │           ├── notifications/# Brevo SMS / WhatsApp OTP / email transport
│   │           ├── rewards/      # usher loyalty milestones
│   │           ├── storage/      # S3-compatible presigned-URL storage port
│   │           ├── admin/        # verifications, disputes, refunds, approvals, stats, ledger
│   │           ├── jobs/         # scheduled job fns + BullMQ cron wiring
│   │           └── audit.ts      # hash-chained, tamper-evident audit log
│   ├── admin/                    # @hq/admin — Vite + React ops console
│   └── mobile/                   # @hq/mobile — Expo React Native client/usher app
├── packages/
│   ├── shared/    # @hq/shared — pure domain logic (money, policy, state machines)
│   ├── database/  # @hq/database — Prisma schema + generated client singleton
│   └── config/    # @hq/config — shared tsconfig / eslint / vitest preset
├── documentation/ # Canonical spec (Executive Summary, PRD, UXRD, TRD) + compliance/
├── docs/          # ← this generated developer documentation
└── CLAUDE.md      # Guidance for AI agents working in this repo (mirrored in AGENTS.md)
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for how these fit together.

---

## Key concepts

| Concept | What it means | Where |
| --- | --- | --- |
| **Money is integer kobo** | ₦1 = 100 kobo. All amounts are `Int`. **Never** floats or `Decimal` — fractional drift silently breaks the ledger. | `@hq/shared/money` |
| **Escrow ledger** | Append-only `EscrowLedger` rows are the source of truth for held funds. Per booking, entries sum to **0** at end of life. | `payments/ledger` |
| **Wallet** | An usher's released, withdrawable balance, backed by an append-only `WalletLedger`. | schema + `payments/ledger` |
| **State machines** | Bookings/orders/withdrawals can only move along documented transitions; illegal moves throw `IllegalTransition`. | `@hq/shared/state-machines` |
| **Policy matrix** | Cancellation / no-show / refund percentages, defined once so every surface computes the same outcome. | `@hq/shared/policy` |
| **Paystack port** | All Paystack access goes through one interface, so the ledger is fully testable with an in-memory fake. | `payments/port` |
| **Idempotency** | Money-mutating requests require an `Idempotency-Key` header; webhooks dedupe by event id. | `payments/ledger/idempotency` |
| **Realtime gateway** | One Socket.IO surface (behind a `RealtimeGateway` port) for booking chat and server→client lifecycle pushes; Redis adapter fans out across replicas. | `realtime/gateway` |
| **Hexagonal ports** | External services (Paystack, storage, realtime) sit behind injected interfaces with in-memory/no-op fakes, so the app runs and tests with no live keys. | `app.ts` DI |
| **Fail-closed in prod** | `createApp` and `env.ts` refuse to boot in production without CORS allowlist, Redis rate limiting, strong JWT secrets, Paystack, Brevo, and storage configured. | `app.ts`, `env.ts` |
| **Audit chain** | The audit log is hash-chained (each row commits to the prior); a daily `auditVerify` job detects tampering. | `audit.ts` |

---

## Common tasks

```bash
pnpm dev                # run the API (watch)
pnpm --filter @hq/api worker   # run scheduled jobs (needs REDIS_URL)

pnpm build              # turbo: tsc -b across packages, in dependency order
pnpm typecheck          # turbo: tsc -b (no emit)
pnpm lint               # turbo: eslint (typescript-eslint + eslint-plugin-security)
pnpm test               # turbo: vitest run (DB-backed — needs DATABASE_URL)
pnpm format             # prettier --write .

# Database (Prisma, package @hq/database)
pnpm db:generate        # prisma generate (after editing schema.prisma)
pnpm db:push            # sync schema without a migration (local dev only)
pnpm db:migrate         # prisma migrate dev — author a tracked migration
pnpm db:deploy          # prisma migrate deploy — apply migrations (CI / prod)
pnpm db:seed            # tsx prisma/seed.ts
pnpm db:studio          # prisma studio
```

Run one package's tasks with a filter; run one test file/name with vitest:

```bash
pnpm --filter @hq/api test
pnpm --filter @hq/api exec vitest run src/modules/payments/__tests__/ledger.test.ts
pnpm --filter @hq/api exec vitest run -t "holds full order amount"
```

---

## Build status (what exists today)

**Built and tested:**

- Phone-OTP auth, JWT access/refresh with rotation, RBAC middleware
- Event / application / invitation flow, batch confirmation
- Full booking lifecycle: confirm → charge → attendance (OTP + self-assert) →
  complete → wallet credit
- Escrow + wallet ledger engine with row-level locking and idempotency
- Refunds (partial-of-batch), disputes (escrow freeze), no-show + auto-complete
- Reconciliation alarm (ledger vs Paystack balance + stale-hold detection)
- Commission sweep, withdrawals
- Paystack webhook pipeline (HMAC verify → dedupe → dispatch)
- Real `HttpPaystack` client (TEST mode) and `InMemoryPaystack` fake
- BullMQ scheduled jobs (auto-complete, no-show, reconcile, commission, retry,
  NDPR retention purge, audit-chain verify)
- OTP & notification delivery via Brevo (WhatsApp OTP primary; SMS + email)
- S3-compatible KYC/photo storage with server-minted presigned URLs
- Realtime: Socket.IO booking chat + lifecycle pushes (Redis adapter, worker emitter)
- Usher discovery, reviews, ratings, availability, profile photos
- Loyalty milestones (rewards) evaluated atomically at booking completion
- NDPR data-subject rights: data export + pseudonymizing erasure
- Hash-chained, tamper-evident audit log + daily integrity check
- Per-endpoint Redis rate limiting; CORS allowlist; production fail-closed config
- Expanded admin console surface (disputes, refunds, two-person approvals, stats, ledger)
- `apps/admin` (Vite + React ops console) and `apps/mobile` (Expo RN client/usher app)
- Dev seed + CI pipeline

**Stubbed / pending (documented in code):**

- FCM push notifications (intent is recorded; sender stubbed until credentials)
- WhatsApp OTP template wiring (logs a dev stub until the WABA + template exist)
- Refresh-token denylist on logout (Phase 9)
- Processing-fee deduction on refunds (pending TRD §23 Q4)

---

## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, modules, data flow
- [`docs/PAYMENTS.md`](./docs/PAYMENTS.md) — escrow/ledger deep-dive (read before touching money)
- [`docs/API.md`](./docs/API.md) — HTTP endpoint reference
- [`documentation/`](./documentation) — canonical product/technical spec
- [`CLAUDE.md`](./CLAUDE.md) — repo conventions for AI agents
