import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load the repo-root .env so DB-backed tests get DATABASE_URL/DIRECT_URL.
config({ path: '../../.env' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 120s ceiling: CI's local Postgres finishes long multi-step flows (e.g. the
    // full booking lifecycle) well under this, but the same flows over Neon's
    // network latency in local runs can exceed 60s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Ledger tests share one Neon DB and the reconciliation test reads global
    // aggregates — run serially so suites don't see each other's rows.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
