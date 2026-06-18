import { defineConfig } from 'vitest/config';

// Shared Vitest defaults. Packages extend via mergeConfig or re-export.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // Integration/property tests hit a real (Neon) Postgres over the network,
    // so give them headroom and run serially to avoid lock-contention flakiness
    // except where a test explicitly opens its own concurrent connections.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
