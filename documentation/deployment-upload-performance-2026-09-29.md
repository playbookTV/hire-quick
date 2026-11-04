# Upload performance release — 29 September 2026

The owner authorized deployment of the [tested upload optimizations](media-upload-performance-2026-09-29.md). The API and worker are deployed successfully, and both internal mobile builds have finished. No schema, provider credential, payment mode or hosting-region change is included.

## Source

- Base revision: `384a5b8c8a38b9f29a7d55be7f38b21b43a22a9f`.
- Frozen release revision: `b73b15677a47b3895769f3aef50a3c404885aa24`.
- [Release manifest and source hashes](validation-evidence/2026-09-29/upload-performance-release/release-manifest.json).
- The snapshot includes the reviewed storage adapter, account lock and mobile transport changes plus their tests. Unrelated working changes were excluded; the user's repository history was preserved.

## Targets

| Target | Release ID | State |
| --- | --- | --- |
| API | `4b9a1f43-7cf4-4dd1-a336-dcb5458e3632` | SUCCESS; instance RUNNING |
| Worker | `e07780fd-ef40-4ef4-acb2-d387b8da141a` | SUCCESS; instance RUNNING |
| Android preview 22 | `55747024-ceda-4619-b448-fd9f065fd9e9` | Finished; artifact HTTP 200 |
| iOS preview 12 | `268f4467-5c89-4169-b20c-ece5c84ac80d` | Finished; artifact HTTP 200 |

Mobile builds identify the frozen release revision and use existing signing credentials. Android distributes an APK; iOS distributes an ad hoc IPA for already registered devices. There is no app-store submission or OTA update.

Railway's environment remains named `production`; this task does not change the existing application/provider configuration. Previous deployments for rollback are API `3c42ac19-0c87-46d9-86b2-96ad6ed44570` and worker `92759f75-6e80-4696-907e-48e82e3b3d45`.

## Upload recovery

Initial Railway uploads failed before any associated build, with request timeouts, a connection reset and snapshot-creation errors. A release-only archive removed development skill links and unrelated documentation/visual assets. Runtime source hashes still matched the tested snapshot. The accepted backend archive was 1,065,504 bytes; Railway's supported `RAILWAY_HTTP_TIMEOUT=180` was set only for those upload commands. Both accepted uploads created source snapshots and entered BUILDING.

The first direct health probe hit a hostname lookup failure; a subsequent request returned HTTP 200 with `{"status":"ok"}` while the preceding release was still serving. This is not post-deployment acceptance for the new release.

## Validation and remaining checks

Pre-release validation passed 60 mobile tests and 53 affected server tests, application/test type checks, lint and documentation checks. The isolated server-test schema was removed. A live synthetic R2 comparison verified the new bounded inspection and conditional-copy safeguard, and cleaned up both fixtures. See the linked performance record for scope and timing limitations.

After Railway reported both deployments SUCCESS, `/health` and `/ready` returned HTTP 200 and unauthenticated upload finalization returned HTTP 401. Both deployment instances reported RUNNING with no diagnosis. The worker startup log confirmed scheduled-job registration. [HTTP acceptance evidence](validation-evidence/2026-09-29/upload-performance-release/http-after-rollout.json).

The existing Sentry release label remains `hq-sentry-20260928`; identify this release by the deployment IDs and manifest above. Both mobile builds finished and identify the frozen release revision. Installed-device upload timing and camera/library acceptance remain for iOS and Android; a finished native build alone does not prove device behavior. Users must install the new preview builds to receive the mobile transport change; the server improvements are already active.

Both installation artifacts returned HTTP 200 with nonempty content lengths: [Android download check](validation-evidence/2026-09-29/upload-performance-release/android-artifact-check.json) and [iPhone download check](validation-evidence/2026-09-29/upload-performance-release/ios-artifact-check.json). [Runtime startup and instance evidence](validation-evidence/2026-09-29/upload-performance-release/runtime-startup.json).

Install: [Android preview 22](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/55747024-ceda-4619-b448-fd9f065fd9e9) · [iOS preview 12](https://expo.dev/accounts/ovalay-studios/projects/hirequick/builds/268f4467-5c89-4169-b20c-ece5c84ac80d).
