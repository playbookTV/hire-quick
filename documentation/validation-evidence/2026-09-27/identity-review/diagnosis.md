# Identity review evidence — 27 September 2026

The reported attempt contained only a started Smile capture session: no provider job ID/status, no uploaded ID or selfie, and no result. It had already been manually rejected when inspected. No decisions were changed during diagnosis. The runtime uses sandbox; the historical row itself did not record its environment.

The admin UI incorrectly labelled session creation as submission, always directed Smile reviews to an external dashboard, hid the upload evidence grid for Smile, and offered an evidence attestation even without evidence. The Smile adapter discarded documented callback image links and identity fields. The status endpoint returns only a verdict and cannot supply photos.

A new characterization test failed on the old adapter: authenticated callback evidence was discarded. The implementation now retains only curated transient evidence (names, masked ID suffix, provider-hosted signed photo links), bound to authenticated callback reference/job and server-confirmed status. Redis expires it in ten minutes; read access also checks signed-media expiry. Raw government IDs and full callback payloads are never stored. Refresh replays the job to the server-owned callback. Incomplete attempts are clearly labelled and approval is blocked in both UI and API.

Source contract: https://docs.usesmileid.com/developer-resources/essentials/verification-webhooks/webhook-types/biometric-kyc.md. Official v12 Node SDK also confirms the status endpoint returns only status/job/user/message.

Validation: workspace 40 focused tests passed in a disposable schema, with all tracked migrations applied and zero drift, then schema cleanup. Browser checks used synthetic records/photos: incomplete capture, inline photos and names, approval inspection, broken image, refresh, access expiry, 390px layout, rejected read-only review; no page errors. Additional malformed/expired signed-link regression passed. Exact-release results and deployment IDs are recorded separately.

Limit: a real device capture and fresh Smile callback have not been performed in this task. Missing historical images cannot be reconstructed; no identity evidence was fabricated and no verification decision was submitted on the user's behalf.

Exact runtime release also passed 40 focused tests, migration application/drift checks and disposable-schema cleanup. The final malformed signed-date guard passed all four evidence unit tests. Runtime API/admin/shared/database files and build inputs match the upload; unused mobile source differences from the inherited validation workspace are not shipped. No schema change was introduced by this fix.

## Deployment outcome

- API `16e01c6f-724d-4da8-bd82-3368ff536250`: SUCCESS.
- Admin `3854f3a7-d4ca-4db1-9132-322e164b2998`: SUCCESS.
- API health/readiness both HTTP 200. New evidence endpoint returns 401 without authentication and 200 with `Cache-Control: no-store` for the authorized admin.
- Reported record still has no evidence, ID image, selfie, or provider job. Its existing rejection timestamp and decision are unchanged.
- Live API source hashes and admin JS/CSS bytes match the validated runtime release.
- 41 distinct focused regression cases passed (40-case suite plus signed-media expiry edge case); eight browser scenarios passed against the frozen admin build. Physical Smile capture/callback delivery remains unverified in this task. Provider mode remains sandbox.
