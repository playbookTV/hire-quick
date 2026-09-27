# Expo SDK 57 upgrade — 21 September 2026

The mobile workspace now uses Expo **57.0.24**, React Native **0.86.3**, React **19.2.3**, Expo Router **57.0.22**, and TypeScript **6.0.3**. The development server previously confirmed that the connected Expo Go app used SDK 57 while the project used SDK 54.

## Changes

- Aligned Expo modules, animation, gesture, safe-area and screen libraries with the official SDK 57 compatibility matrix; updated the pnpm lockfile.
- Declared matching React DOM and Expo DOM WebView dependencies to avoid the old versions being selected as automatic peers.
- Replaced the old React Navigation bottom-tab type import with `expo-router/js-tabs`, removed the standalone bottom-tabs dependency, and updated tab icon callbacks to accept React Native `ColorValue`.
- Removed the obsolete `newArchEnabled` option. Expo now supplies workspace watching and module resolution; the relative `.js` to TypeScript resolver remains.
- Raised the workspace and mobile Node requirement to **22.13.0** and aligned the shared React type override with React 19.2. Existing CI and containers already use Node 22.
- Kept the development-only OTP request diagnostics added before this upgrade. They log the endpoint, method, response status and request ID, without phone numbers, OTPs, request bodies or credentials.

The SDK 55 and 56 migration notes were reviewed before installing the complete SDK 57 dependency set. A temporary Expo 55 package installation was superseded; no intermediate SDK build was released.

## Validation

- Expo dependency compatibility check passed.
- Expo Doctor: **21/21 checks passed**.
- Mobile typecheck and lint passed; admin typecheck passed with the updated shared React types.
- Shared package build and Android/iOS production bundle exports passed.
- Mobile session regression suite: **23/23 tests passed**.
- Android and iOS native project generation passed with `expo prebuild --no-install` in an isolated temporary folder; generated native files were not added to this repository.
- Offline frozen lockfile validation passed using `--lockfile-only`.
- Restarted Expo Go with the staging API origin. The running Android manifest reports **SDK 57.0.0**.
- The Android development bundle compiled successfully and returned HTTP 200 (11,723,753 bytes).

The development URL is `exp://192.168.1.246:8081` on the current local network. Devices need Expo Go for SDK 57. SDK 57 raises minimum iOS support to **16.4**. Existing APKs are unchanged and require a new native build to include this upgrade. On-device navigation and OTP delivery still need a walkthrough; this upgrade fixes the Expo Go SDK mismatch, not a verified cause of the earlier HTTP 404.

## References

- [Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57)
- [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [Router SDK 55 to 56 migration](https://docs.expo.dev/router/migrate/sdk-55-to-56/)
- [Expo monorepo configuration](https://docs.expo.dev/guides/monorepos/)
