# Payment validation — 12 September 2026

**Verified outcome: 241 unique passing tests** — 207 API tests, 32 shared-domain tests, and 2 local provider lifecycle tests. One external-storage integration test was skipped. No failures remain unresolved among the executed tests.

The API total combines a complete serial run with corrective reruns; it is **not** a claim that one complete invocation passed cleanly. The actual Paystack TEST withdrawal was **not attempted** because automatic approval review requires explicit user approval for that external financial action.

## Executed checks

| Check                                | Result                                                         | Scope                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial complete serial API suite    | 192 passed, 5 failed, 1 skipped; 27 files; 946.8 s             | Found three fixture problems described below.                                                                                                            |
| Final audit antecedent suites        | 14 passed; 3 files; 70.1 s                                     | Auth, rewards API, and remediation-pass ran first in a fresh schema.                                                                                     |
| Final affected API suites            | 55 passed; 7 files; 356.5 s                                    | Withdrawal outcomes 11; terminal operations 9; mobile retry/receipt logic 18; signed webhook units 6; booking lifecycle 3; usher wiring 5; compliance 3. |
| Combined API coverage                | **207 unique passes, 1 skip, 0 unresolved failures; 28 files** | Latest results per file; includes four added mobile cases and six new webhook cases after initial discovery.                                             |
| Local provider lifecycle integration | **2 passed; 71.8 s**                                           | Same service/ledger lifecycle through `InMemoryPaystack` and `HttpPaystack` using a loopback HTTP server.                                                |
| Shared suite                         | **32 passed; 4 files**                                         | Money, policy, state machines, and DTOs.                                                                                                                 |
| Final workspace typecheck and lint   | **12 tasks passed; zero cache hits**                           | `pnpm exec turbo run typecheck lint --force` on the frozen implementation.                                                                               |
| Selected strict test-source check    | **Passed**                                                     | Twelve selected changed/affected tests and validation scripts, including the corrected fixture tests; mixed API/mobile imports use Bundler resolution.   |
| Tracked migrations and drift         | **Five migrations applied; no difference detected**            | Verified in both the complete-suite schema and the final-rerun schema. No application migration was added.                                               |

The local provider lifecycle cases exercise charge initialization/verification, hold, release, refund, withdrawal, commission sweep, replay handling, and zero-drift reconciliation. The HTTP case makes real requests to a deterministic loopback server. This verifies local adapter/service/ledger integration; it does not certify the actual provider's fees, asynchronous processing, or account configuration.

The storage test follows its existing skip condition because external storage credentials are disabled in this isolated runner. Native-device behavior is also unverified: the 18 mobile cases exercise pure retry and persisted-receipt logic.

## Fixture corrections verified by reruns

- Three booking lifecycle cases fabricated an old charge reference. They now read the order's stored reference, preserving coverage of the current initialization flow.
- One full-refund cancellation case used an expired fixed event date. That case now places its event seven days ahead; production cancellation policy was unchanged.
- Three suites deleted chained audit records during teardown, poisoning a later compliance check. Those deletions were removed; the actor foreign key had already been removed by an existing migration. The tamper test now restores its changed row in `finally`. All 14 antecedent tests ran before the final compliance verification, which passed. Production audit behavior was unchanged.

Temporary strict-check issues in pending-refund mocks, optional receipt types, and fixture indexing were also corrected. The ordinary API project excludes test files, so the additional selected-source check was necessary.

## Database isolation and cleanup

No Docker, Podman, PostgreSQL server/client binaries, Postgres.app, or cached PostgreSQL installation was found locally. With orchestrator authorization, validation used disposable schemas on the configured Neon account, through a direct connection to **PostgreSQL 18.6**. CI uses PostgreSQL 16; these runs do not establish behavior on every supported server version.

Both configured connection variables point to the pooled host. The runner derives the direct host and overrides **both** child URLs with the same Prisma `schema` and PostgreSQL startup `search_path`. Eight simultaneous transactions on eight distinct connections verified the exact generated schema/search path before migrations or tests. No test used the configured URLs unchanged, and no shared session was terminated.

The runner suppresses external provider, notification, identity, and storage credentials during local tests. It redacts connection URLs and secrets from its logs. It drops only its own generated schema and verifies absence afterward.

| Disposable schema                       | Attempt                                                                           | Cleanup                   |
| --------------------------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `hq_validation_20260912023241_864a3ef8` | Initial static gate during active implementation; stopped before migrations/tests | Removed; absence verified |
| `hq_validation_20260912024056_bc1637de` | Local provider integration and complete serial API suite                          | Removed; absence verified |
| `hq_validation_20260912030006_39b2b9da` | Final ordered audit antecedents and affected API tests                            | Removed; absence verified |

The first static gate encountered a temporarily inconsistent withdrawal response type while another worker was implementing it. That attempt is not counted as database test evidence.

## Actual TEST withdrawal: prepared, approval required

The probe was prepared under the orchestrator's direction and reviewed, but **explicit user approval is required before execution**. Automatic approval review rejected the proposed command before it ran because a Paystack TEST withdrawal POST creates an external financial side effect the user had not explicitly authorized. It stated that the disposable-database tests alone were acceptable. The transfer was not retried through another tool or route; database-only checks proceeded and passed.

The concrete action in `scripts/validation/test-provider-withdrawal.ts` is:

- At most **one transfer POST for 10,000 kobo (₦100)** to the existing TEST recipient selected by the orchestrator; no live key and no recipient modification.
- Successful provider responses must confirm TEST domain, NGN, amount, and reference. Polling is GET-only and bounded to ten attempts.
- Same-key replay must preserve one withdrawal and one debit. Terminal success requires `PAID`/`RECORDED`, a 7,000-kobo wallet remainder, and zero reversals. Terminal failure requires `FAILED`/`FAILED`, a 17,000-kobo wallet balance, and one reversal. Pending retains 7,000 kobo without a reversal and is reported as incomplete.
- The wallet is seeded using a synthetic charge/release fixture. Even a successful probe would not establish a fully funded charge-to-payout lifecycle, refund/sweep provider behavior, or fee reconciliation.

This is an authorization block, **not evidence of a provider enablement or processing failure**. The orchestrator separately owns TEST account read/checkout-initialization evidence. No actual-provider transfer result exists from this agent's work.

## Evidence and repeatability

- Runner: `scripts/validation/isolated-payments.mjs`; read-only preflight by default, disposable validation only with `--run`.
- Local lifecycle: `scripts/validation/paystack-lifecycle.test.ts`, with `scripts/validation/vitest.config.mts`.
- Prepared provider probe: `scripts/validation/test-provider-withdrawal.ts`; excluded from normal Vitest discovery.
- Final strict selected-source configuration: `/private/tmp/hq-validation-tests-tsconfig.json`.
- Initial static-gate log: `/private/tmp/hq_validation_20260912023241_864a3ef8.log`.
- Complete-run log: `/private/tmp/hq_validation_20260912024056_bc1637de.log`.
- Final ordered-rerun log: `/private/tmp/hq_validation_20260912030006_39b2b9da.log`.
- Per-file combined counts: `/private/tmp/hq-api-validation-counts.json`.

The final runner used `--audit-antecedents-first` to force the three formerly destructive fixture suites before compliance, plus `--api-test-files` for the seven affected files. Actual-provider transaction flags were removed after the approval rejection. No actual-provider probe was executed.

Configuration inspection found matching TEST secrets in `.env` and `.mcp.json`, with no LIVE secret in those two files. Separately, the orchestrator reported no live-key-shaped values in a 434-tracked-file scan for `sk_live_`/`pk_live_` followed by at least 16 alphanumeric characters. These are bounded pattern checks, not a comprehensive secret audit.

Knowledge-graph tools were unavailable in this agent's catalog. Findings use direct source inspection and bounded text searches; graph freshness and index coverage remain unknown. Linear acceptance decisions remain with the orchestrator.
