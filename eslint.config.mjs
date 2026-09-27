import shared from '@hq/config/eslint';
import tseslint from 'typescript-eslint';

export default [
  ...shared,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['apps/mobile/plugins/**/*.js'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { require: 'readonly', module: 'readonly' },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['scripts/check-docs.mjs'],
    // Local documentation paths/text are repository inputs, not HTTP input.
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-unsafe-regex': 'off',
    },
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parserOptions: {
        ...tseslint.configs.disableTypeChecked.languageOptions.parserOptions,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { process: 'readonly' },
    },
  },
];
