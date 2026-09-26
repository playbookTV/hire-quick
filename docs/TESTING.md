# Testing and validation

[Documentation index](README.md) · [Development](DEVELOPMENT.md)

## Test layers

| Layer                       | Scope                                                                   | Requirements                                                                 |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Shared tests                | Money arithmetic, policy, state tables, DTO boundaries                  | Node/pnpm; generally no database                                             |
| API unit/contract tests     | Validators, provider parsing, client recovery controllers, pure helpers | Built dependencies; inspect each suite for local server/Redis requirements   |
| API integration/concurrency | Routes, identity, ledger, payments, privacy, database locks             | Disposable real PostgreSQL                                                   |
| Realtime runtime            | Socket.IO authorization/delivery/outage handling                        | Suite-dependent disposable Redis and mocked ports or guarded real PostgreSQL |
| Native/admin acceptance     | Device/browser workflows, restart, uploads, hosted checkout             | Running clients, intended API and provider test environment                  |

A filename containing `unit` is not a universal no-infrastructure guarantee. Check the selected suite. Root `pnpm test` runs workspace test scripts; admin/mobile currently have no independent package `test` scripts. Some mobile controller tests run from API test suites. Passing backend tests does not prove native UX behavior.

## Database isolation is mandatory

Never run the API suite against production or the ordinary shared development database. Tests write fixtures and can inspect global ledger/audit aggregates. [The disposable guard](../apps/api/src/modules/auth/__tests__/assert-disposable-db.ts) accepts a generated `hq_validation_<14 digits>_<8 hex>` schema or `CI=true` with a local database named `hirequick_test`. It also verifies `current_schema()`; not every historical suite has this guard, so absence of a rejection does not make a target safe.

The [API Vitest config](../apps/api/vitest.config.ts) loads root `.env`, runs files serially in a single fork, and sets test/hook timeouts to **120 seconds**. Do not run multiple test processes against one database. Concurrency tests intentionally open independent connections inside a suite.

## Local equivalent of CI

Use a fresh, disposable PostgreSQL instance. The following example uses port 5433 to avoid the development database. It assumes a new shell with no provider credentials exported; the explicit values keep root `.env` credentials out of the test process.

```sh
docker run --name hq-test-postgres -d \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hirequick_test \
  -p 127.0.0.1:5433:5432 postgres:16
docker exec hq-test-postgres pg_isready -U postgres -d hirequick_test
export DATABASE_URL='postgresql://postgres:postgres@localhost:5433/hirequick_test'
export DIRECT_URL="$DATABASE_URL"
export NODE_ENV=test
export CI=true
export JWT_ACCESS_SECRET=test-local-access-only
export JWT_REFRESH_SECRET=test-local-refresh-only
export OTP_VERIFIER_SECRET=isolated-test-verifier-secret-never-deployed
export OTP_VERIFIER_KEY_ID=isolated-test
export OTP_VERIFIER_PREVIOUS_SECRET=''
export OTP_VERIFIER_PREVIOUS_KEY_ID=''
export PAYSTACK_SECRET_KEY=sk_test_isolated_validation
export PAYSTACK_WEBHOOK_SECRET=isolated-webhook-secret
export PAYSTACK_OPERATING_RECIPIENT=''
export BREVO_API_KEY=''
export KUDISMS_API_KEY='' KUDISMS_SENDER_ID='HIREQUICK'
export TWILIO_ACCOUNT_SID='' TWILIO_API_KEY_SID='' TWILIO_API_KEY_SECRET=''
export TWILIO_WHATSAPP_FROM='' TWILIO_WHATSAPP_CONTENT_SID=''
export FCM_PROJECT_ID='' FCM_CLIENT_EMAIL='' FCM_PRIVATE_KEY=''
export KYC_MODE=smile SMILE_PARTNER_ID='' SMILE_API_KEY=''
export STORAGE_BUCKET='' STORAGE_ACCESS_KEY='' STORAGE_SECRET_KEY=''
export REDIS_URL=''
export WITHDRAWAL_REQUIRE_BVN=false
```

Wait for PostgreSQL readiness before continuing. These dummy provider values are for tests that inject fakes; do not start the ordinary API against them as an interactive payment environment.

Then match [CI](../.github/workflows/ci.yml) from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm docs:check
pnpm typecheck
pnpm lint
pnpm typecheck:tests
pnpm lint:tests
pnpm db:deploy
pnpm --filter @hq/database exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --exit-code
pnpm test
```

A nonzero migration diff indicates drift or an execution failure; inspect it instead of replacing deploy with `db:push`. Only after confirming this is the disposable test container, remove it with `docker rm -f hq-test-postgres`. Close the test shell afterward to discard test environment exports.

## Targeted tests

With disposable storage migrated and dependencies built:

```sh
pnpm --filter @hq/shared test
pnpm --filter @hq/api exec vitest run src/modules/payments/__tests__/ledger.test.ts
pnpm --filter @hq/api exec vitest run src/modules/payments/__tests__/concurrency.test.ts
pnpm --filter @hq/api exec vitest run -t 'holds the full order amount'
```

Use exact test names from the selected source; a name filter matching zero tests provides no evidence. Run relevant auth/privacy/realtime tests when changing shared authorization boundaries, not only the feature's happy path.

## Existing isolated validation runner

[isolated-payments.mjs](../scripts/validation/isolated-payments.mjs) reads root `.env` plus environment overrides, selects a direct endpoint, and performs a read-only preflight without `--run`:

```sh
node scripts/validation/isolated-payments.mjs
```

After choosing an authorized disposable validation target:

```sh
node scripts/validation/isolated-payments.mjs --run
```

This creates a uniquely named schema, sets both Prisma `schema` and PostgreSQL `search_path`, verifies eight distinct connections, generates the client, checks code, deploys migrations, checks drift, and runs integration tests. It drops only its generated schema in `finally` and verifies removal. It requires a previously built `@hq/database` package. A hard process termination can prevent cleanup; use its recorded schema name to investigate, never a broad schema-delete command.

For a bounded API suite:

```sh
node scripts/validation/isolated-payments.mjs --run \
  --api-test-files=src/modules/payments/__tests__/checkout-recovery.test.ts
```

`--static-already-passed` skips static checks and is appropriate only with current evidence. This runner does not replace every CI step, including test-source checks. Options named `--actual-test-withdrawal-*` contact the configured TEST provider and are a separate provider exercise, not routine offline testing. Logs go to a redacted `/private/tmp/hq_validation_*.log`; that path is platform-specific.

## Acceptance and evidence

For payment changes, check duplicate requests, changed payload under one key, lost responses, provider pending/failure/reversal, worker recovery, and concurrent attempts. For mobile, close/reopen the screen, restart the app, rotate credentials, switch accounts, and verify the original outcome remains recoverable. For private data, test another account's IDs and expired/revoked sessions.

Record commit, environment, database isolation, exact commands, pass/fail counts, provider mode, and limitations. Sanitize tokens, phone numbers, IDs where sensitive, and signed URLs. Store dated evidence under `documentation/`; do not turn an old report into a claim about the current revision. Documentation-only work normally needs link/format/contract checks, not a database or live provider run.
