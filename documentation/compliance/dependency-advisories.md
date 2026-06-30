# Dependency advisories (`pnpm audit`)

Status as of the compliance-remediation pass (2026-06-28). `pnpm audit` reports
**6 advisories: 1 critical, 1 high, 4 moderate**. All are **dev/build tooling
only** — none ship in the production API runtime — and all trace to two roots.

## Root cause

| Advisory | Severity | Package | Patched | Source in our tree |
|---|---|---|---|---|
| GHSA-5xrq-8626-4rwp | critical | vitest `<3.2.6` | `>=3.2.6` | `vitest@2.1.9` (direct devDep) |
| GHSA-fx2h-pf6j-xcff | high | vite `<=6.4.2` | `>=6.4.3` | `vite@5.4.21` under `vitest@2.1.9` |
| GHSA-4w7w-66w2-5vf9 | moderate | vite `<=6.4.1` | `>=6.4.2` | `vite@5.4.21` under `vitest@2.1.9` |
| GHSA-v6wh-96g9-6wx3 | moderate | launch-editor (via vite) | vite `>=6.4.3` | `vite@5.4.21` under `vitest@2.1.9` |
| GHSA-67mh-4wv8-2f99 | moderate | esbuild `<=0.24.2` | `>=0.25.0` | `esbuild@0.21.5` under `vite@5.4.21` (vitest) |
| GHSA-w5hq-g745-h8pq | moderate | uuid `<11.1.1` | `>=11.1.1` | `uuid@7.0.3`, deep transitive in dev tooling |

Five of the six are the **`vitest@2.x` subtree** (`vitest → vite@5.4.21 → esbuild@0.21.5`).
The sixth is `uuid@7.0.3`, buried several layers deep in dev tooling.

## Why no override was applied

`vitest@2.1.9` (and `@vitest/mocker@2.1.9`) declare a `vite ^5.0.0` peer, so pinning
`vite >=6.4.3` / `esbuild >=0.25.0` via `pnpm.overrides` would violate that peer and
risk breaking the test runner — not a *safe* bump. `uuid@7 → 11` is a four-major jump
for a transitive consumer expecting the v7 API. The plan for this pass was "attempt
safe upgrades, document the rest"; there is **no safe override here**.

## Exposure assessment

- **Production runtime is unaffected.** vitest/vite/esbuild are test/build tooling and
  are not part of the deployed API bundle. `uuid@7.0.3` is in dev/build tooling, not the
  runtime payout/escrow path (runtime UUIDs use `node:crypto` / Prisma `@default(uuid())`).
- **The critical vitest advisory only affects `vitest --ui`** (the UI server serving
  arbitrary files). This repo runs `vitest run` in CI and locally — the UI server is
  never started — so it is not exploitable in our usage.

## Remediation path (tracked separately)

Clear all six by upgrading the test runner in one deliberate, fully-tested change:

1. Bump `vitest` to `^3` across `package.json`, `apps/api`, `packages/shared` (pulls
   `vite@6.4.3+` and `esbuild@0.25+`, clearing 5 of 6).
2. Re-pin / dedupe the `uuid@7.0.3` consumer (identify via `pnpm why uuid`) to `>=11.1.1`,
   or override once its consumers are confirmed v11-compatible.
3. Adjust `packages/config/vitest.preset.ts` for any vitest 3 config changes, then run
   the full DB-backed suite (CI order) before merging.

This is a major-version upgrade and is intentionally out of scope for the
compliance-remediation pass to keep that change reviewable and money-safe.
