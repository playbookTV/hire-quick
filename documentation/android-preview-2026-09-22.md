# Android payment-policy preview — 22 September 2026

Status: Android build **5** is **FINISHED**. The downloaded APK passed package and embedded-bundle inspection.

- [Download updated APK](https://expo.dev/artifacts/eas/dHITGW8ecIsiYz3FeAAMdsn2lCoV9Z1lDQmngtjPUck.apk)

- [Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/65b28810-bf92-49bf-843c-fd02501ae0ca)
- Version 0.0.1, Android versionCode 5, Expo SDK 57.
- Package `com.hirequick.mobile`; existing remote signing key reused with credential changes disabled.
- Internal preview APK targeting `https://prolific-love-production-2775.up.railway.app` (TEST/staging).

Includes the approved cancellation quotes, approval/processing states, held-completion payout deadline and dispute eligibility screens for OVA-136 and OVA-137. The corresponding API, worker and admin were deployed separately; see [server release](deployment-2026-09-22.md).

The isolated source snapshot `/private/tmp/hq-apk-20260922` contains 443 files from the working tree. Preview auto-increment is enabled in the snapshot. The workspace was not committed or pushed. The inspected upload excludes private environment files, dependencies, Redis persistence, documentation and unrelated website work. `.easignore` now explicitly excludes Redis persistence files for future builds.

Frozen-lockfile installation, shared build, mobile typecheck, mobile lint and fresh Android native release bundling all passed. The release bundle contains the intended staging API origin. Every source-manifest hash matched before submission.

Evidence: [source manifest](validation-evidence/2026-09-22/android-preview/release-manifest.json), [validation](validation-evidence/2026-09-22/android-preview/validation.json), [build record](validation-evidence/2026-09-22/android-preview/eas-build.json).

The downloaded APK is 109,067,752 bytes; SHA-256 `276415e50891062f778b779d2b3ea75856fd7a9cc3dde97df98b280b608c9746`. Its embedded manifest confirms package `com.hirequick.mobile`, version 0.0.1 and versionCode 5. Its v2 signing certificate matches build 4. The embedded Android bundle contains the staging API origin and the new hold, cancellation split and approval messages, which were absent from build 4. See [APK inspection](validation-evidence/2026-09-22/android-preview/apk-inspection.json).

On-device installation and interaction remain untested. No Play Store submission or additional Paystack financial probe was performed. OVA-166 live-account evidence remains separate from this TEST/staging preview.
