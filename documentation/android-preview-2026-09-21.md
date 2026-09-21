# Android preview — 21 September 2026

Status: Android build **4** is **FINISHED** on Expo. The signed APK is available.

- [Download APK](https://expo.dev/artifacts/eas/wEwY6fYaK8ygCyAGHtdZrhJ3EFpBBsYHdenOB-eZ34M.apk)
- [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/d79d6c9f-55bf-4251-bc03-af6c43f43d1f)
- Version **0.0.1**, Android build number **4**, Expo SDK **57**.
- Package: `com.hirequick.mobile`; existing remote signing credentials reused with credential changes disabled.
- Staging API: `https://prolific-love-production-2775.up.railway.app`.
- Profile: preview; internal distribution; APK output; pnpm 10.27.0.

## Source and validation

Isolated snapshot: `/private/tmp/hirequick-apk-20260921T130647Z`, commit `9aa950cd0028a278d7aec7d434c25ce1383a0e04`. Includes the working SDK 57 source and the Babel dependency fix. No workspace commit or push was performed. Preview auto-increment is enabled only in the snapshot.

Frozen-lockfile install, shared package build, mobile typecheck, mobile lint and native Android release bundling (`expo export:embed --dev false --minify true --reset-cache`) passed. Direct resolution of `babel-preset-expo` also passed. The release bundle contains the expected staging API origin and OTP request endpoint. All 455 source-manifest entries matched before upload. Private environment files are excluded.

The user explicitly approved uploading the corrected source to the existing `ovalay-studios/hirequick` Expo project. Build 4 was accepted with the existing signing key.

Downloaded the completed APK and verified its embedded Android bundle contains the staging API origin and OTP request endpoint. APK size: 109,065,016 bytes. SHA-256: `a7f03f6b8dfee5451e7e7fd82581ad9b198278f8116809a9eb594b91ca3d0f89`.

## Dependency correction

Build 3 failed during release bundling because the app Babel configuration could not resolve `babel-preset-expo`. Added the SDK-matched preset 57.0.12 directly, aligned `@babel/runtime` to the compatible 7.29.7 range, and pinned preview builds to pnpm 10.27.0. The corrected snapshot passes the native release bundling command with a fresh cache.

## Test login

The four staging QA accounts were verified separately before this build; see [QA login validation](staging-qa-login-2026-09-21.md). The installed APK uses manual code entry after Send code; development-only quick-login buttons are hidden. The shared QA code is configured on the server and is not embedded in the APK.

[Validation evidence](validation-evidence/2026-09-21/android-preview/validation.json), [source manifest](validation-evidence/2026-09-21/android-preview/release-manifest.json), [EAS build record](validation-evidence/2026-09-21/android-preview/eas-build.json), and [failed build 3 diagnosis](validation-evidence/2026-09-21/android-preview/failed-build-3.json).

No Play Store submission or backend deployment is part of this build. On-device installation remains untested.
