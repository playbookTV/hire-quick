// Expo configures pnpm workspace watching and dependency resolution automatically.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const config = getSentryExpoConfig(__dirname);

// The repo writes relative imports with a `.js` extension (NodeNext convention,
// see CLAUDE.md), but our TS source files are `.ts`/`.tsx`. tsc (Bundler
// resolution) maps `./x.js` → `./x.tsx`; Metro does not. Bridge it: for a
// relative `.js` specifier, try the extensionless source first, fall back to
// the literal request (so real compiled `.js`, e.g. @hq/shared/dist, still work).
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to the literal `.js` request
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
