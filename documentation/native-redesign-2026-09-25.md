# Native redesign builds — 25 September 2026

Both native builds finished successfully and their downloaded artifacts were inspected.

| Platform | Artifact | Build | Distribution |
| --- | --- | --- | --- |
| Android | [Download APK](https://expo.dev/artifacts/eas/vr2DJdq85_RsHjCMtEgQiivIgcUyY-Ojdu56fi0VVMY.apk) | [9](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/462aea31-1ce1-42e4-af62-cf67a5d34bbc) | Internal preview; directly installable |
| iOS | [Download IPA](https://expo.dev/artifacts/eas/C-uDc-kY0pCKT9oAgG9d48MDK9dE0aL1YlYI83V3iLg.ipa) | [3](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/d86b6ad2-ecca-4308-aff3-f0d24ee32d7a) | Signed App Store archive; not submitted |

Version 0.0.1. Android package: `com.hirequick.mobile`. iOS identifier: `com.ovalay.hirequick`, approved by the user and registered under the Leslie Williams Apple developer team. iOS requires 16.4 or later.

Both artifacts include the Figma screen/layout redesign, shared components, Archivo/Manrope fonts, welcome artwork and Design System Token Manager. Both use the staging API origin from the preview configuration. Android uses the `preview` build profile; iOS uses `ios-archive`, which inherits preview configuration and changes distribution to `store`.

## Installation status

The Android APK can update the previous signed installation: its signing certificate matches build 8. The iOS IPA requires TestFlight distribution or re-signing with an ad hoc provisioning profile containing the target phone. The user reported completing registration, but Expo still returned no registered devices at the final check. No device-specific profile was created. The signed archive allowed native compilation to finish independently of that step.

No App Store/TestFlight submission, Play Store submission or backend deployment was performed. App Store Connect encryption compliance remains to be completed before future TestFlight testing. Installed-device testing has not been performed.

## Source and validation

Source snapshot: `/private/tmp/hq-native-redesign-20260925`. The Android snapshot commit is `5fa1cb46496b01c9a1280c88ad4b98e05d7f4780`. The iOS variant adds its approved identifier, archive profile and camera dependency fixes. No workspace commit or push was made. All 542 original archive files matched the working tree; private environment and signing files were excluded.

Frozen-lockfile installation, shared build, mobile typecheck and lint passed. Mobile typecheck and lint passed again after each iOS dependency correction. Android and iOS JavaScript/assets exports also passed before native submission.

[Source manifest](validation-evidence/2026-09-25/native-redesign/source-manifest.json) · [iOS source variant](validation-evidence/2026-09-25/native-redesign/ios-source-variant.json) · [Validation](validation-evidence/2026-09-25/native-redesign/validation.json).

## Artifact inspection

Android: 163,797,859 bytes; SHA-256 `12de87c92d0ce50d5338356fa5841aed31c45a5b5e2bd325d88acf79f89e6bdc`. ZIP integrity passed; APK v2 signer certificate matches build 8. The expected API origin and exact Figma welcome-photo, Archivo and Manrope font hashes are present.

iOS: 36,360,528 bytes; SHA-256 `8b89c79e4ada523a5b063c7c0f9f6327e597c144299b4e1ae10c02a9e6e146d0`. ZIP integrity, app identifier/version, expected API origin, exact design-asset hashes and embedded Kamera/KameraVision frameworks passed inspection. The executable CMS signature, all 1,234 signed code-page hashes, sealed Info.plist/CodeResources and provisioning-profile CMS signature passed cryptographic checks. macOS `codesign` could not establish certificate-chain trust on this host (`CSSMERR_TP_NOT_TRUSTED`); that limitation remains separate from the successful cryptographic checks and EAS signing/export result.

[APK inspection](validation-evidence/2026-09-25/native-redesign/apk-inspection.json) · [IPA inspection](validation-evidence/2026-09-25/native-redesign/ipa-inspection.json) · [Android build](validation-evidence/2026-09-25/native-redesign/android-build.json) · [iOS build](validation-evidence/2026-09-25/native-redesign/ios-build.json).

## iOS dependency fixes

Smile ID’s CocoaPods hook resolves `@smileid/kamera/package.json` from the native app directory, requiring a direct mobile dependency under pnpm. Swift Package Manager then exposed another constraint: Smile `ios-spm` 12.1.0 requires exactly `kamera-spm` 1.0.5, while the JavaScript dependency range had selected 1.0.6. The direct dependency and workspace override now pin 1.0.5, including transitive references. Package resolution and the supplied iOS linking helper were checked before the successful third build.

Android build 9 retains the original Kamera 1.0.6 dependency; the iOS source variant records this build difference. Both builds contain the same UI, tokens, fonts and artwork. Earlier failed iOS build records are retained in the evidence directory.
