# Smile ID integration

New biometric onboarding uses Smile ID v3 with `@smileid/usesmileid` 12.1.0. The old v11 wrapper only supports the old React Native architecture; v12 supports this app's Expo 57 / React Native 0.86 build.

## Current incident status

**Closed on 29 September 2026:** the owner confirmed that Smile ID approved the account and verification now works. Provider-side account approval resolved the submission failure. See the [closure record](../documentation/smile-submission-closure-2026-09-29.md) for evidence and scope; earlier dated reports describe the pre-resolution state.

## Configure and release

Set API-only `KYC_MODE=smile`, `SMILE_PARTNER_ID`, `SMILE_API_KEY`, `SMILE_ENVIRONMENT`, `SMILE_CALLBACK_URL`, and `SMILE_PRIVACY_POLICY_URL`. The callback base must be `https://<api-host>/webhooks/smile-id`; the privacy URL must be your public HTTPS notice. Configure the callback domain in Smile ID **Developer → Security Settings → Callback URLs** for the selected environment. The API appends two path segments for each attempt; preserve them at your proxy and allow dynamic callback paths. Do not log callback URLs or request bodies in proxy/access logs.

Enable Biometric KYC and Nigeria BVN / **NIN_V2** on the account. NIN_V2 requires a NIMC enterprise ID registered in the Smile dashboard. Production rejects sandbox mode. Never put the API key into Expo public variables or a bundled `smile_config.json`.

Confirm with Smile ID that the account has the provider-side approval required to submit verifications. Successful token issuance and a configured callback URL alone did not establish submission readiness in the September 2026 incident.

Build and install new Android and iOS binaries; an OTA update cannot add native modules. Expo Go is unsupported. The app includes the face analyzer for each platform, camera permissions, screen-orientation plugin and MLKit Kotlin/KSP build configuration. No document analyzer is needed for NIN/BVN plus selfie. Do not downgrade to the v11 SDK or install VisionCamera/worklets-core for v12.1.

The original Smile provider migration reused `providerReferenceId` and preserved prior Dojah records. The client/business extension requires `20261001190000_client_identity_and_business_verification` before API release. Regenerate Prisma before compiling. Existing clients start without account type and personal verification; existing usher decisions and financial data are preserved. Release the client app alongside the gate so existing clients have a usable verification path.

## Flow and trust boundary

1. Authenticated client or usher posts `idType` (`NIN` or `BVN`), 11-digit `idNumber`, `givenNames`, `lastName`, and optional `email` to `/api/me/verification/kyc/start`. Email is validated and token-bound, not persisted on the verification. Sandbox fixtures require their documented email; the account's phone is sent only in production. Optional `referenceId` refreshes only an owned, latest pending Smile session less than one hour old. Session creation and the limit of five Smile sessions in a rolling 6-hour window are serialized under the subject profile lock. Attempts stop counting exactly 6 hours after creation, so the allowance recovers automatically without support intervention or a scheduled reset. A blocked start returns `429 KYC_ATTEMPTS_EXCEEDED` with the remaining wait until the next attempt becomes available; the mobile app displays this message. Blocked requests do not extend the cooldown. Refreshing an eligible existing session does not consume an attempt and remains available at the limit. A provider failure rolls back without consuming an attempt. Historical Dojah attempts do not exhaust the new provider budget. Verification records and the lifetime `kycAttempts` counter are retained; neither needs to be cleared for the cooldown to expire.
2. Backend binds Nigeria, identity/contact fields, the biometric product, and a per-attempt callback URL into a short-lived token. Smile replaces sensitive identity values and the callback URL with opaque references. The returned session is `no-store`; the app keeps it only in memory. The API never stores raw NIN/BVN or biometric files in Postgres. New attempts record their sandbox/production environment.
3. The native SDK displays biometric consent, instructions, enhanced liveness/selfie capture, preview and submission. Token expiry refreshes the same attempt. Cancellation returns to the form; submission moves to status polling and **never** grants access.
4. Smile calls `/webhooks/smile-id/:referenceId/:callbackKey`. The API checks the documented `Response-Signature` / `Response-Timestamp` HMAC and the secret callback capability. Smile's timestamp signature does **not** cover the body, so neither a body-supplied reference nor a claimed `clear` status alone is trusted. The callback URL is bound server-side into the token and never returned to the app; its key is domain-separated HMAC over the attempt reference.
5. The API fetches `/v3/status/{jobId}` using server credentials, matches job/user IDs, and applies its status. `block` rejects; `attention`, `error`, `processing` and unknown values stay pending. `clear` means the ID exists, the selfie matches the authority photo, liveness passed and no fraud signal fired. **It does not compare the typed names with the ID record**, so HireQuick does that before approving (see [Name check](#name-check)). No face score, watchlist outcome or liveness signal is fabricated from summary status. Pending job IDs/statuses are retained for operator review. Network/malformed/mismatched provider replies return 503 for callback redelivery.
6. Unknown, duplicate, superseded, legacy Dojah, and manually reviewed attempts cannot replace the active result. Existing admin precedence and manual history remain. Admins review identity evidence directly in HireQuick. A session without a callback is labelled “Capture started · no evidence received”, not a submitted verification.

### Name check

Smile's v3 Biometric KYC verdict ignores the names bound into the token. A tester verified with invented names, a real NIN and their own selfie (27 October 2026). `name-match.ts` compares the authenticated callback's `user_provided_info` (the names HireQuick bound) with `id_fields` (the authority record). It ignores case, accents, punctuation and word order. The record may hold extra names, such as a middle name the applicant left out. The callback must report the same status as `/v3/status`, or its names are not used.

| `nameCheck`   | Meaning                                                                                 | Outcome of a `clear` verdict                                 |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `matched`     | Every typed name is on the record (at least two names)                                  | Verified                                                     |
| `partial`     | Some typed names are on the record (spelling variant, maiden/married surname, one name) | Stays pending for operator review                            |
| `unavailable` | The callback carried no names, or a different status                                    | Stays pending for operator review                            |
| `mismatch`    | No typed name is on the record                                                          | Rejected with `NAME_MISMATCH` and an applicant-facing reason |

`nameCheck` is stored in `govLookup` (no names are persisted) and shown to admins. The app shows held attempts as needing review. Sentry receives `SMILE_NAME_REVIEW` (warning) for holds and `SMILE_NAME_MISMATCH` (info) for rejections. A reviewer approves a held attempt only when the record name and the supplied name belong to the same person. Sandbox fixtures may return no record names, so a sandbox `clear` can be held for review.

The check binds the verification to the name the applicant typed. It does not change the profile `displayName`, which is still chosen separately.

Use HTTPS end to end. Callback capabilities must remain confidential in access logs, tracing and error reporting. API key rotation changes the callback capability, so drain/replay pending jobs before rotating. If callback retries are exhausted, replay the job's webhook from Smile; the mobile status screen polls HireQuick, it does not invent a verdict or accept client-supplied job ownership. Pending provider errors/attention require operator review. Cancelled sessions survive only while the form is mounted; reopening starts another bounded session.

## Mandatory clients and business verification

Clients use the same personal identity session/callback flow as ushers, with the lock, attempt budget, ownership and latest-attempt rules applied to their client profile. Capture/submission is never approval. The historical `UsherVerification` table now has exactly one client or usher subject. Individual clients need personal identity approval; business clients need personal identity **and** approved business verification. See [Workflows](WORKFLOWS.md#client-onboarding-and-trust).

The API uses Smile's separately supported **V1 KYB** contract, not the V3 biometric verdict. Enable Nigerian Business Verification with Smile before enabling business onboarding in production. The September biometric incident closure does **not** prove KYB activation. Supported categories are company (`co`), business name (`bn`), and incorporated trustee (`it`). The submitted registry number, returned job/user identifiers, successful `1012`/`Verify_Business` result, nonempty registered name, and active registry status must match. Unknown, mismatched, inactive, unavailable, or unsupported results fail closed into operator review.

A durable business attempt is saved before lookup. Retrying a pending submission returns it; admin refresh retrieves `/v1/job_status` for the same job and never creates another paid lookup. A lost/unavailable result stays pending. Operators can refresh or reject with an actionable reason, allowing a fresh bounded submission (five per six hours). Do not approve from a dashboard screenshot or a client-supplied success value. Provider activation/network failures require resolution before another attempt.

In Admin > Verifications > Business verifications, review the registry name, representative's verified identity evidence, and their authority document. Refresh identity evidence requests the existing personal-job webhook replay; it does not start a new identity check. Approval requires an explicit authority confirmation and review note. Production rejects sandbox/unknown registry evidence. Only approval publishes the registry name and business badge. Account type alone grants neither access nor trust; verified individuals upgrading to business are gated until review completes. This is a single-representative client profile, not multi-user organisation membership or corporate billing.

Private authority uploads use the same owned, finalized-upload contract. The app accepts an evidence photo; the API also supports PDF. Approved/rejected documents follow existing 90/30-day KYC retention. Erasure clears identity/business details and schedules documents for deletion. Provider responses are curated to registration metadata and never retain director lists or raw bodies. Configure Smile-held retention separately.

Primary KYB reference: [Smile business verification](https://legacy-docs.usesmileid.com/products/for-businesses-kyb/business-verification.md). New client camera flows and actual KYB activation must be validated with the provider and physical devices before deployment; local test doubles are not live-provider evidence.

## Admin evidence review

Authenticated callbacks carry `image_links.selfie_image`, `id_fields.photo_url` / `document_link`, and names. The status endpoint only returns a verdict; it cannot return photos. After job/user matching and an authoritative status check, HireQuick caches a curated review object in Redis for at most ten minutes: names, masked ID suffix, and signed image URLs. Full ID numbers, addresses, device signals, receipt URLs, and raw payloads are discarded. No biometric files are copied into HireQuick storage. Signed media is restricted to the documented Smile results bucket, and access ends earlier if the signature expires.

Admin-only `GET /api/admin/verifications/:id/evidence` returns audited, `no-store` evidence bound to the saved attempt and job. `POST /api/admin/verifications/:id/evidence/refresh` requests a webhook replay using the server-owned callback URL, with a 30-second per-record throttle. The UI waits up to 30 seconds for callback delivery and reports unavailable/expired evidence explicitly. Legacy attempts with no job cannot be replayed; do not invent credentials or a provider result. Started captures must be completed by the applicant.

The reviewer sees the authority name, applicant name, masked ID, identity photo/document, and selfie in HireQuick. Manual approval requires both review images; the API independently requires currently available evidence for that attempt. Rejection still accepts a reason when a capture is incomplete. Pending, approved, and rejected records can be inspected. Sandbox is labelled on new attempts; older attempts whose environment was not recorded are labelled unknown. Existing automatic provider decisions and manual precedence are unchanged.

Primary evidence contract: [Biometric KYC webhook](https://docs.usesmileid.com/developer-resources/essentials/verification-webhooks/webhook-types/biometric-kyc.md) and [replay API](https://docs.usesmileid.com/api-reference/core-resources/replay-webhook/replay-a-verification-webhook.md).

## Validation before live activation

Use Smile's documented sandbox identities. Exercise a clear result, a block, attention/error, cancellation, camera denial, token refresh, network loss and duplicate/out-of-order callbacks. Verify the callback domain accepts dynamic paths, token-bound callback URLs remain opaque, and the SDK can submit with backend-bound name/contact fields. Confirm no callback paths, API keys, tokens, identity numbers or raw provider payloads appear in logs. Test real camera capture on physical Android/iOS devices after installing fresh binaries. Configure provider-side biometric retention separately; HireQuick's document cleanup cannot delete Smile-held data.

## Primary references

- [Mobile setup and compatibility](https://docs.usesmileid.com/developer-resources/sdks/mobile/setup)
- [Biometric KYC migration and capture flow](https://docs.usesmileid.com/guides/migration-guides/biometric-kyc-mobile-integration-migration-guide-v10-v11-to-v12)
- [Token API and server-bound payloads](https://docs.usesmileid.com/api-reference/set-up/access)
- [Webhook authentication](https://docs.usesmileid.com/developer-resources/essentials/verification-webhooks/receive-webhooks/configure-your-webhook-server)
- [Authoritative verification status](https://docs.usesmileid.com/api-reference/core-resources/verification-status/retrieve-a-verification-result)
- [Nigerian ID coverage](https://docs.usesmileid.com/id-coverage/verify-with-id-number/nigeria)

## Client extension validation (1 October 2026)

- 125 targeted API tests passed across identity/business verification, monitoring, recruitment, checkout recovery, uploads, venue privacy, existing booking lifecycle and authentication. The business approval HTTP path was additionally rerun after the admin form correction.
- Shared rules (82 tests), mobile utilities/onboarding (65 tests), and admin session/API clients (11 tests) passed. Workspace and test type checks, lint, documentation links and whitespace checks passed; lint retains the existing environment-regex and native-plugin file-path warnings.
- Tracked migrations applied with no Prisma drift on isolated disposable schemas; every validation schema was removed. No shared/live application schema was migrated.
- Browser walkthroughs of actual screens with mocked accounts/native services checked 320/390/1024px onboarding and 320/390/1440px admin review, required authority evidence/consent, and approval disabled when identity evidence is unavailable. These are screen-level checks, not physical-camera or live-KYB validation.
- Android and iOS JavaScript/Hermes exports passed. The owner subsequently confirmed business-verification activation and authorized release. Deployment progress and remaining device/provider acceptance checks are recorded in the [1 October release record](../documentation/deployment-client-verification-2026-10-01.md).

## Validation recorded 23 September 2026

- 58 focused tests passed: 16 Smile adapter tests, 26 environment/auth configuration tests, and 16 database-backed verification tests (including concurrent starts, stale/duplicate callbacks, manual review precedence, legacy provider isolation and the new provider retry budget).
- API, mobile, admin and API-test type checks passed. Changed production and test files passed lint; maintained documentation links and diff whitespace checks passed.
- Android and iOS JavaScript/Hermes exports passed. A disposable native prebuild generated both projects with Android New Architecture, Kotlin 2.3.20 / KSP 2.3.6 and the iOS Smile Swift Package links.
- All tracked migrations applied to disposable PostgreSQL schemas; drift checks found no difference. Each temporary schema was removed after testing.
- The sandbox API credential is configured locally and on Railway. API, worker, and admin deployment and token issuance from the deployed API were verified; see [deployment record](../documentation/deployment-smile-2026-09-23.md). Physical-device capture and actual provider callback delivery remain outstanding. [Android build 8](../documentation/android-smile-2026-09-23.md) compiled successfully and its downloaded package passed identity, signing-certificate, bundle and ZIP checks. The follow-up email correction passed 17 provider tests and 17 database-backed verification tests.

## Sandbox identity inputs

Smile matches sandbox identities using given names, surname **and email**. Use the optional email field in HireQuick for sandbox tests. The documented Biometric KYC success fixture is `Amina Fatou`, `Clearwater`, `amina.clearwater@example.com`; a blocked fixture is `Obinna Chukwu`, `Twinley`, `obinna.twinley@example.com`. Use a fictitious 11-digit BVN such as `00000000000`; ID format validation still applies. Do not use a real NIN/BVN in sandbox. These are provider fixtures, not a HireQuick approval bypass: only the authenticated provider result can settle a verification.

Source: [Smile sandbox testing](https://docs.usesmileid.com/developer-resources/essentials/testing-in-sandbox).

Dependency integration also declares the existing form resolver's Zod 3 peer explicitly (Smile uses its own Zod 4), and pins TypeScript in the shared lint package so the parser and rules use the same compiler version.

## Failure monitoring

Smile diagnostics now use fixed `SMILE_*` codes, `provider=smile_id`, a fixed stage, and an optional random attempt reference. Diagnostic tags exclude provider tokens, callback secrets, names, NIN/BVN, photos and provider response bodies. Sentry preserves captured message and exception text; request/user data and arbitrary context remain excluded. The blanket message privacy placeholder is no longer applied. The same reference connects a native capture failure with server-side callback diagnostics. Repeated code/reference pairs are suppressed for 15 minutes per process/client (bounded to 256 entries); no durable delivery or global deduplication is implied.

- API: token/session failures, result-fetch failures, unexpected callback-processing failures, evidence-refresh failures, invalid callbacks, provider `error`/`attention`, and applied rejections. Rejections are informational, attention/invalid callbacks are warnings, and technical faults are errors. Invalid callback URLs supply no correlation data because they are untrusted. Existing HTTP/verification decisions are unchanged.
- Mobile: capture-module load, session start, SDK capture/submission failure, and token-refresh failure. HTTP submission failures and malformed successful responses report before Retry/Exit, retaining only an allowlisted `sdk_error` and validated `http_status`; the terminal SDK callback remains a fallback for other failures. Success, voluntary cancellation and expected validation/attempt-limit responses are not errors. Reporting is active in distributed builds, not development builds. See [immediate submission diagnostics](../documentation/smile-submission-diagnostics-2026-09-27.md).
- Admin: browser/render failures and handled Smile evidence/review failures report to `hirequick-admin`. The observability page shows recent issues plus current submission counts and a link to all Smile diagnostics.
- Worker: `smileMonitoring` runs every five minutes and reports `SMILE_STALLED_ATTEMPTS` when the latest Smile attempt for a client or usher has remained pending over one hour. The query covers attempts started within seven days, is read-only, and times out at the database. Missing callbacks may represent abandoned captures; counts do not prove a provider outage. Monitoring never approves/rejects a record, retries a paid identity check, or changes attempt limits.

See [deployment and validation](../documentation/smile-monitoring-2026-09-27.md) for the shipped versions and remaining device-test limits.
