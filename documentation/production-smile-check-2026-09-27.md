# Smile ID production readiness check — 27 September 2026

The user enabled production in Smile ID and requested live verification.

## Confirmed live

- Running API deployment: `16e01c6f-724d-4da8-bd82-3368ff536250`.
- Running API and saved API/worker settings still specify `SMILE_ENVIRONMENT=sandbox`.
- The deployed credential mints a sandbox token (HTTP 200).
- The same deployed credential is rejected by the production token endpoint (HTTP 401), both for general access and a biometric-product token request without identity data.
- The signed-in Smile ID portal has an existing production credential named Hirequick for the configured partner. Production callback allowlisting is disabled, and no default callback URL is listed. HireQuick supplies its own per-attempt callback URL.
- API health, readiness and privacy-policy endpoints return 200. A callback with invalid credentials returns 401.
- No new Smile verification attempts have arrived since the previously inspected records; no provider job IDs or evidence are present on those records.

## Initial access blocker

The existing production configuration was downloaded from the portal using its Config action. Access could not be completed because the computer-use tool reported that the Mac was locked. The user was asked to unlock it. No key was printed, regenerated or revoked. Backend credentials and provider mode were not changed.

After access resumes: validate the existing production credential, install it in the backend secret configuration, set production mode, wait for redeployment, check the running production endpoint/session configuration, then observe a real applicant capture through provider callback and admin evidence display. Do not count token issuance, unit tests, or an unsigned callback rejection as proof of complete biometric capture.

## Production activation completed

The user resumed the task after unlocking the Mac. The existing Hirequick production API key was read from the signed-in provider account, validated from the running backend (HTTP 200 with token issuance), and installed as a backend secret without printing it in commands' output. The SDK configuration download is not interchangeable with the production API key.

The API and worker were switched to `SMILE_ENVIRONMENT=production` and redeployed from their existing artifacts. No application code, database schema, identity decisions, or financial settings changed.

- API deployment `bc045de1-3d1d-4d05-a9f0-2fadd9a4a357`: SUCCESS; running process confirms production mode and the production endpoint.
- Worker deployment `8dda7107-8bc2-4d03-b3be-403da7936613`: SUCCESS.
- Admin remains on `3854f3a7-d4ca-4db1-9132-322e164b2998`.
- Production general-access and biometric-product token requests both return HTTP 200 with tokens. Neither check submits identity details or a verification job.
- API health and readiness both return HTTP 200; Redis responds PONG.

The user selected account ending 1964 for a real capture. They were instructed to reopen the verification screen and complete a fresh ID/selfie submission after production became live. As of the first observation window, no new attempt had arrived. Actual camera capture, provider job completion, callback delivery, and resulting admin photos are not yet confirmed. Old rejected attempts and their decisions are unchanged.
