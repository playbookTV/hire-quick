import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['scripts/validation/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
