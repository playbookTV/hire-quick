import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@hq/database': fileURLToPath(new URL('./fake-database.ts', import.meta.url)) } },
  test: {
    include: [
      'audits/2026-09-26-swarm/auth-evidence/*.test.ts',
      'apps/api/src/modules/auth/__tests__/middleware.unit.test.ts',
    ],
    environment: 'node',
    fileParallelism: false,
  },
});
