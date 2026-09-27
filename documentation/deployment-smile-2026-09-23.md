# Smile ID sandbox deployment — 23 September 2026

API, worker, and admin deployed successfully to the existing Railway TEST/staging application at the owner's request. Railway's environment is named `production`; both backend processes retain `NODE_ENV=staging`, Paystack TEST, and Smile sandbox mode.

| Service | Deployment |
| --- | --- |
| API | `f617d982-a577-45ac-9138-d6c13215fc3b` |
| Worker | `d5a5a6bd-1719-40f9-95a8-681e94ffb702` |
| Admin | `51df026f-cc1d-468a-b818-e87f55aa7fd4` |

Frozen source: `/private/tmp/hq-smile-release-20260923T172811Z`. The [manifest](validation-evidence/2026-09-23/smile-release/release-manifest.json) records its hashes and differences from the prior upload release. Credential scanning passed; local secrets and unrelated website work were excluded. No commit or push was made.

All six Smile settings were saved and verified for the API and worker. The callback base is `https://prolific-love-production-2775.up.railway.app/webhooks/smile-id`; the consent link uses the existing public privacy policy at `/api/legal/privacy-policy` (currently a JSON representation). Each verification receives a server-generated secured callback path. The provider's dashboard callback-domain allowlist was not inspected during this deployment.

API and admin builds and 42 focused Smile/configuration tests passed. Both Railway environments passed the compiled configuration validator. No database migration was required: the renamed Prisma property maps to the existing column and index. No customer verification, schema reset, seed, or financial transaction was submitted.

Railway reported SUCCESS for all three deployments. Container checks confirmed the expected deployment IDs, source hashes, staging/sandbox modes, database connectivity and Redis PONG. The deployed API successfully obtained a sandbox token from Smile (HTTP 200); no token or credential is stored in this report. HTTP checks confirmed health 200, unauthenticated KYC rejection, unsigned callback rejection, public policy availability, and the updated Smile admin assets.

Evidence: [Railway status](validation-evidence/2026-09-23/smile-release/railway-status.json), [API container](validation-evidence/2026-09-23/smile-release/api-container-checks.json), [worker container](validation-evidence/2026-09-23/smile-release/worker-container-checks.json), [HTTP checks](validation-evidence/2026-09-23/smile-release/http-checks.json).

This deployment does not update installed mobile binaries. A fresh native mobile build and an on-device sandbox verification are still required to verify capture, submission, provider callback delivery, and final approval end to end.

## Sandbox email follow-up

The API was subsequently updated to accept the test identity email and omit the account phone from sandbox payloads. The updated API deployment is `43ceff8b-f5b3-4c7e-b321-f17459d47e0b`; worker/admin remain on the deployments above. The [Android Smile build record](android-smile-2026-09-23.md) includes the corrected APK, validation and deployed API checks.
