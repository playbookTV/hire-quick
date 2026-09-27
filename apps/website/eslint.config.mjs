import shared from '@hq/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...shared,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
