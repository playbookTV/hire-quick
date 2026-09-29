import { defineConfig } from 'vitest/config';

// Session and API clients take injected storage/fetch, so they run in Node
// without a browser environment or the app's Vite plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
