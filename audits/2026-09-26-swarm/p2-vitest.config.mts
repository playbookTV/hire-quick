import { defineConfig } from 'vitest/config';

// Pure session/client checks only: deliberately does not load the API dotenv config.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'apps/api/src/modules/auth/__tests__/admin-session.unit.test.ts',
      'apps/api/src/modules/auth/__tests__/mobile-session.unit.test.ts',
      'apps/api/src/modules/auth/__tests__/role-refresh-client.unit.test.ts',
    ],
  },
});
