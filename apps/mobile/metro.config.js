// Metro config for the pnpm monorepo. Watches the workspace root so the
// pnpm-symlinked `@hq/shared` (precompiled ESM in dist) resolves, and lets Metro
// look in both the app's and the root's node_modules.
//
// Do NOT set `disableHierarchicalLookup` — that breaks pnpm's nested store.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Follow pnpm symlinks and honour the "exports" field (@hq/shared ships ESM).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

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
