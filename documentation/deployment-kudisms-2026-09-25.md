# KudiSMS API deployment — 25 September 2026

Deployed API release `c2928d51-4817-4607-a526-af768a65e062` to the existing
Railway `prolific-love` service. Railway reports SUCCESS. The environment is
named `production`; the running API retains `NODE_ENV=staging`.

The release was assembled from the running API source from deployment
`43ceff8b-f5b3-4c7e-b321-f17459d47e0b`, with only the OTP transports, callback,
configuration and focused tests overlaid. The snapshot is
`/private/tmp/hq-kudi-release-20260925`. Unrelated workspace changes were not
included. The worker and admin were not deployed; this release changes no
shared job, database or realtime contract. No migration was needed.

The local KudiSMS API key was transferred through stdin into Railway API
secrets, and `KUDISMS_SENDER_ID` was set to `HIREQUICK`. Runtime checks confirm
the expected deployment ID, valid configuration and active KudiSMS selection.
No credentials were printed or included in the release source. A scan matched
only the credential-free loopback Redis default in the environment schema.

The isolated release build and 149 focused tests passed. Public checks returned:

- `GET /health`: 200, status ok.
- `POST /webhooks/kudisms` with a synthetic UNKNOWN/150 report: 200, ok true.
- `POST /webhooks/kudisms` with an invalid report: 400, INVALID_WEBHOOK.

Callback URL:
`https://prolific-love-production-2775.up.railway.app/webhooks/kudisms`

The callback is advisory telemetry, with no authentication or account changes.
The smoke check sends no SMS. Registration of this URL in KudiSMS and an actual
handset delivery/login test remain outstanding.

Evidence: [release manifest](validation-evidence/2026-09-25/kudisms-release/release-manifest.json),
[validation](validation-evidence/2026-09-25/kudisms-release/validation.json),
[runtime](validation-evidence/2026-09-25/kudisms-release/runtime-checks.json),
[HTTP checks](validation-evidence/2026-09-25/kudisms-release/http-checks.json),
[deployment status](validation-evidence/2026-09-25/kudisms-release/deployment-status.json).
