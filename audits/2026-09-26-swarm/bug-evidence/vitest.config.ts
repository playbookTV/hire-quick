import { defineConfig } from 'vitest/config';

// Deliberately isolated from apps/api/vitest.config.ts and its real .env loading.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/mobile/lib/__tests__/**/*.test.ts',
      'apps/api/src/modules/payments/__tests__/checkout-mobile.unit.test.ts',
      'audits/2026-09-26-swarm/bug-evidence/adversarial.test.ts',
    ],
  },
});
