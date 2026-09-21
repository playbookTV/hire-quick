# Android preview — 20 September 2026

Status: EAS build **FINISHED**. Version **0.0.1**, Android version code **2**.

- [Download APK](https://expo.dev/artifacts/eas/i11pYxpaQWjmdjbDbMs3tTFIVu3-qSSq20K6XwrWrrc.apk)
- [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/19d364c1-fce6-415f-a380-5297fc454311)
- Existing project: `ovalay-studios/hirequick`; package: `com.hirequick.mobile`.
- Existing remote signing credentials reused with credential changes disabled.
- API origin: `https://prolific-love-production-2775.up.railway.app`.

## Source and checks

Isolated snapshot: `/private/tmp/hirequick-apk-20260920T203811Z`, commit `a6a5efe01e4035fe611b48fda0cdbd17ca069548`. Includes current working source, including uncommitted mobile changes. The workspace was not committed or pushed. Preview auto-increment was enabled only in this snapshot; EAS incremented the Android build number from 1 to 2.

Frozen-lockfile dependency installation, shared package build, mobile typecheck, mobile lint, and Android export all passed. The exported bundle contained the expected API origin and OTP endpoint. The 397-file source manifest matched the snapshot before upload.

The user explicitly approved source upload to this existing Expo project. EAS completed the signed APK build and its download returned HTTP 200 (87,187,883 bytes).

[Validation evidence](validation-evidence/2026-09-20/android-preview/validation.json), [source manifest](validation-evidence/2026-09-20/android-preview/release-manifest.json), and [EAS build record](validation-evidence/2026-09-20/android-preview/eas-build.json).

No Play Store submission or backend deployment was performed. On-device installation and OTP delivery remain untested; build success alone does not confirm the original screenshot issue is resolved.
