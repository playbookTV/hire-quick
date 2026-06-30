// Admin is a browser/React app, so it layers the React Hooks rules on top of the
// shared flat config. Run from apps/admin via `eslint .` — flat config resolves to
// the nearest config file, so this takes precedence over the repo-root config and
// keeps the Hooks rules out of the Node packages.
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
