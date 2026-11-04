# Media upload mobile release — 28 September 2026

The user authorized building and deploying the shared media-upload correction. This release uses the existing EAS `preview` profile and internal distribution. The correction ensures that the outgoing Blob has the same MIME type as the signed PUT request; see the [diagnosis and regression evidence](media-upload-fix-2026-09-28.md).

## Source and distribution

- Base repository revision: `384a5b8c8a38b9f29a7d55be7f38b21b43a22a9f`.
- Frozen release revision: `be124c03260066bf16943e39110f4c9c3290da1f`.
- Android preview build **19**: `abb99546-c7f9-4a84-a941-5a0b620512ef` — FINISHED.
- iOS preview build **11**: `9c1ff4cf-6197-49c2-8b6c-9c20b8b43432` — FINISHED.
- Distribution: Android APK and iOS ad hoc for existing registered devices, using existing credentials.
- The API, worker, admin and website require no changes for this mobile correction. No backend deployment or migration was performed.

The snapshot was prepared in a temporary checkout. The user's working changes and repository history were preserved. Source hashes, archive exclusions and build IDs are recorded in the [release manifest](validation-evidence/2026-09-28/media-upload-release/release-manifest.json) and [build evidence](validation-evidence/2026-09-28/media-upload-release/mobile-builds.json).

## Build upload recovery

Two archive uploads failed with `EPIPE` before any build was queued, reserving Android versions 17 and 18. The initial archive was 13.2 MB. Release-only archive exclusions removed Git objects and unrelated visual evidence/website assets; `.git` was necessary because the CLI's directory check did not match `.git/`. The inspected archive preserved the tested mobile source and excluded environment files. The resulting compressed archive was 976 KB and uploaded successfully for both platforms. These exclusions were confined to the frozen release checkout.

## Validation and limits

The pre-release mobile suite passed all 57 tests, including four regressions through the installed Expo request normalization. Mobile type checking, targeted source/test lint and documentation checks passed. The archive's uploader and regression-test hashes matched the tested working source. The API health endpoint returned HTTP 200 with `status: ok`; see [preflight evidence](validation-evidence/2026-09-28/media-upload-release/preflight.json).

Both builds finished successfully and report the frozen release revision. Their installation artifacts returned HTTP 200 with nonempty content lengths: [Android artifact check](validation-evidence/2026-09-28/media-upload-release/android-artifact.json) and [iOS artifact check](validation-evidence/2026-09-28/media-upload-release/ios-artifact.json).

Install: [Android build 19](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/abb99546-c7f9-4a84-a941-5a0b620512ef) · [iOS build 11](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/9c1ff4cf-6197-49c2-8b6c-9c20b8b43432).

Users must install the new preview builds to receive the correction. No app-store submission or OTA update was performed. Native upload acceptance remains outstanding: verify library/camera photo uploads, saved profile/portfolio images and a booking chat image on both platforms. This release confirms compilation and distribution, not real-device upload success.
