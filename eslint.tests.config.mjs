import tseslint from 'typescript-eslint';

// Tests have their own no-emit projects; production's project service deliberately
// excludes them. Keep async assertions and setup failures visible to CI.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    files: ['apps/api/src/**/*.test.ts', 'apps/api/src/**/__tests__/**/*.ts', 'packages/shared/src/**/*.test.ts', 'packages/shared/src/**/__tests__/**/*.ts', 'scripts/validation/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: ['./apps/api/tsconfig.tests.json', './packages/shared/tsconfig.tests.json', './scripts/validation/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
