# Smile ID Android build — 23 September 2026

Status: Android build **8** is **FINISHED** and APK verification passed.

[Download APK](https://expo.dev/artifacts/eas/b-_Z_hYK8d5Z_plejF5Q4R7CVvH5A-9CbTMCNOj9hU4.apk)

[Expo build](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/f73ca4cb-afff-48c9-bae1-a931d9ee9b92)

Internal preview APK for `com.hirequick.mobile`, Expo SDK 57, Smile v12.1, version 0.0.1. The existing Expo project and Android signing credentials are reused with credential changes disabled. Preview builds now increment the remote Android build number automatically. Build 7 was canceled before completion because the sandbox test identity email was missing from the form.

The frozen source snapshot is `/private/tmp/hq-smile-apk-20260923T191249Z`. It starts from the source deployed for Smile, includes the updated mobile form and the matching verification adapter changes, and excludes unrelated in-progress workspace edits. All 462 archive files matched the manifest; local credentials and unrelated website work are excluded.

## Sandbox email correction

Smile matches its predefined sandbox identities using name and email. HireQuick now accepts an optional email in the identity form, validates it at the API boundary, and binds it into the provider token. It does not persist this email on the verification record or return it in the session. The account's phone number is sent only for production verification, keeping it out of sandbox requests.

The API correction is deployed as `43ceff8b-f5b3-4c7e-b321-f17459d47e0b`. The worker and admin remain on the successful initial Smile release. No database migration was needed.

Seventeen provider tests and seventeen database-backed verification tests passed, including HTTP email validation and forwarding. The disposable database schema was removed. Frozen-lockfile install, API/shared builds, mobile and API-test typechecks, changed-source and test lint, and upload-archive checks passed.

The deployed API matches the corrected source, connects to PostgreSQL and Redis, and successfully minted a sandbox token with the documented fictitious identity, email and secured callback. This did not submit a verification job or grant approval. Public health returns 200 and an unsigned test callback returns 401.

Evidence directory: [build and API evidence](validation-evidence/2026-09-23/smile-apk-20260923T191249Z/release-manifest.json).

## APK verification

The downloaded APK is 164,645,135 bytes. SHA-256: `e9c29b2c0d1cf0bed3e683b843c1531724d3a42d646317eefec0d1f9d6751c27`. ZIP integrity passed. The manifest confirms `com.hirequick.mobile`, versionCode 8, versionName 0.0.1. The signing certificate matches build 6, allowing an update of the existing installation. The package contains the Smile native camera code, verification form with email, and intended staging API origin. The server API key is absent from the JavaScript bundle. Native compilation succeeded in approximately 31 minutes.

[APK inspection](validation-evidence/2026-09-23/smile-apk-20260923T191249Z/apk-inspection.json) · [Expo build record](validation-evidence/2026-09-23/smile-apk-20260923T191249Z/eas-build.json).

## Device test

Install the finished APK before testing; the previous APK does not contain the native Smile modules. For the documented success fixture, use given names `Amina Fatou`, surname `Clearwater`, email `amina.clearwater@example.com`, BVN and a fictitious 11-digit number such as `00000000000`. The optional email field must be populated for Smile's sandbox matching. For a blocked face-match fixture, use `Obinna Chukwu`, `Twinley`, and `obinna.twinley@example.com` on a separate test account. Do not use a real NIN/BVN in sandbox.

Source: [Smile sandbox test identities](https://docs.usesmileid.com/developer-resources/essentials/testing-in-sandbox).

The sandbox callback domain should be configured as `prolific-love-production-2775.up.railway.app` in Smile's dashboard. The API appends secured per-attempt paths to `/webhooks/smile-id`. Dashboard configuration could not be inspected because the available browser session requires login; the owner was asked to confirm it.

Physical-device capture and actual provider callback delivery remain unverified. Token creation, mocked tests and native compilation do not prove a full on-device verification. No production identity verification, store submission or live financial transaction is included.
