# HireQuick — Backend

> Mobile-first staffing marketplace for Lagos event ushers. Clients book and pay
> event staff; funds are held in **escrow until verified attendance**; the
> platform takes a **15% commission**.

This repository is the **backend monorepo**. The mobile and admin apps are not
built yet — `apps/api` is currently the only application. The canonical product
and technical specs live in [`documentation/`](./documentation) (Executive
Summary, PRD, UXRD, TRD). Code comments cite section numbers like `(TRD §6)` or
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

---

## Project structure

```
hire-quick/
├── apps/
│   └── api/                      # @hq/api — Express HTTP service (the only app)
│       └── src/
│           ├── app.ts            # createApp(): middleware, routers, error envelope
│           ├── server.ts         # HTTP entrypoint (wires the real Paystack client)
│           ├── worker.ts         # Scheduled-jobs entrypoint (BullMQ)
│           ├── env.ts            # Zod-validated environment
│           └── modules/
│               ├── auth/         # phone-OTP login, JWT, RBAC middleware
│               ├── events/       # events, applications, invitations, confirm-batch
│               ├── bookings/     # booking lifecycle, attendance, disputes
│               ├── payments/     # ★ ledger, reconciliation, Paystack port, webhook
│               ├── profile/      # profile + usher verification submission
│               ├── admin/        # verification approve/reject (audit-logged)
│               ├── jobs/         # scheduled job fns + BullMQ cron wiring
│               └── audit.ts      # append-only audit log writer
├── packages/
│   ├── shared/    # @hq/shared — pure domain logic (money, policy, state machines)
│   ├── database/  # @hq/database — Prisma schema + generated client singleton
│   └── config/    # @hq/config — shared tsconfig / eslint / vitest preset
├── documentation/ # Canonical spec (Executive Summary, PRD, UXRD, TRD)
├── docs/          # ← this generated developer documentation
└── CLAUDE.md      # Guidance for AI agents working in this repo
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
pnpm db:push            # sync schema without a migration
pnpm db:migrate         # prisma migrate dev
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
- BullMQ scheduled jobs (auto-complete, no-show, reconcile, commission, retry)
- Admin verification approve/reject (audit-logged)
- Dev seed + CI pipeline

**Stubbed / pending (documented in code):**

- SMS provider for OTP (currently logs the code in dev)
- File storage for verification assets (accepts pre-signed URLs as plain URLs)
- Refresh-token denylist on logout (Phase 9)
- Processing-fee deduction on refunds (pending TRD §23 Q4)
- Mobile and admin client apps

---

## Further reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, modules, data flow
- [`docs/PAYMENTS.md`](./docs/PAYMENTS.md) — escrow/ledger deep-dive (read before touching money)
- [`docs/API.md`](./docs/API.md) — HTTP endpoint reference
- [`documentation/`](./documentation) — canonical product/technical spec
- [`CLAUDE.md`](./CLAUDE.md) — repo conventions for AI agents
