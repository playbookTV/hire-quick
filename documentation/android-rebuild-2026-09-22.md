# Fresh Android APK rebuild — 22 September 2026

Status: Android build **6** is **FINISHED**; downloaded APK verification passed.

[Download APK](https://expo.dev/artifacts/eas/eyMRJB7KotATIdDnH1VlY5TBJZrzfKFOl_Si4NjIcJA.apk)

[Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/5053b236-c4a3-446c-857f-f2f04483372d)

The owner explicitly requested a fresh APK build and approved uploading the prepared private source snapshot to the existing `ovalay-studios/hirequick` Expo project. The 453-file snapshot is `/private/tmp/hq-apk-rebuild-20260922T165642Z`. Private environment files, credentials, Redis data, generated dependencies and unrelated website work are excluded. All archive hashes matched the source manifest before upload. No workspace commit or push was performed.

Internal preview APK, version 0.0.1, Android versionCode 6, package `com.hirequick.mobile`, Expo SDK 57, pnpm 10.27.0. Existing remote signing credentials reused with credential changes disabled. Build cache explicitly cleared. The preview API is `https://prolific-love-production-2775.up.railway.app` (TEST/staging).

Frozen-lockfile installation, shared build, mobile typecheck/lint and a fresh Android release bundle passed. The bundle contains the intended API origin.

This snapshot includes the latest payment, Gifted Chat and upload/finalization mobile changes. The chat and upload contracts require their matching API/worker/database rollout described in [chat rollout](chat-2026-09-22.md) and [upload rollout](uploads-2026-09-22.md). This APK build does not perform that backend rollout or certify compatibility with an older deployed API.

Evidence: [source manifest](validation-evidence/20260922/android-rebuild-20260922T165642Z/release-manifest.json), [validation](validation-evidence/20260922/android-rebuild-20260922T165642Z/validation.json), [Expo record](validation-evidence/20260922/android-rebuild-20260922T165642Z/eas-build.json).

On-device installation and interaction remain untested. No store submission or provider financial probe.

## APK verification

Downloaded package size: 111,058,634 bytes. SHA-256: `8c738080e1a8594f39f36d4809639a49969e15c8c2c462c538e709132ce34ada`. Archive integrity passed. The embedded manifest confirms versionCode 6 and the existing app identity. The v2 signing certificate matches build 5. The embedded bundle contains the staging API origin, payment-policy screens and paginated chat endpoint. Package evidence is in `apk-inspection.json` alongside the release evidence above.
