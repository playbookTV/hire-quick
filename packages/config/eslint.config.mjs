// Shared ESLint flat config. Consumed by each package's eslint.config.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/*.config.*',
      // Tests are excluded from the build tsconfig, so the type-aware parser
      // can't resolve them; they're validated by vitest + tsc instead.
      '**/*.test.ts',
      '**/__tests__/**',
      '**/prisma/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Money backend: an unawaited promise can silently drop a ledger write.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Noisy false positives on typed-enum bracket access (keys are unions,
      // never user input). The real injection surface is DB/HTTP, covered by
      // Prisma's parameterization and zod validation.
      'security/detect-object-injection': 'off',
    },
  },
);
