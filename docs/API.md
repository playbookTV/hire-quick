# API reference

[Documentation index](README.md) · [Workflows](WORKFLOWS.md) · [Payments](PAYMENTS.md)

Reviewed against the mounted routers on 2026-09-16. Local base URL: `http://localhost:4000`. The tables inventory HTTP methods and paths; linked route handlers and shared validators define complete field constraints and response shapes. There is no generated OpenAPI contract in this guide.

## Conventions

Authenticated calls send `Authorization: Bearer <accessToken>`. HTTP checks token validity and current ACTIVE account status. Role and ownership checks are endpoint-specific; an ADMIN token does not automatically authorize party-only booking routes.

Clients also need an account type and verified personal identity; business accounts need business approval. Until then, marketplace routes return `403 CLIENT_VERIFICATION_REQUIRED`, including staff discovery, new events, invitations and checkout. `/api/me` and verification/privacy routes remain available. `/api/bookings` shows only owned paid bookings, and their detail/obligation routes remain usable. Public client trust fields contain verification states, not private identity evidence. A verified business name comes from the registry and cannot be changed through profile PATCH.

Bodies are JSON with `Content-Type: application/json`, except raw signed webhooks and direct object-store uploads. Money is integer kobo; UUIDs identify resources. Lists do not share a universal pagination envelope: some are capped arrays, others have dedicated response objects. Do not infer cursor support.

The **Key** column marks routes enforcing `Idempotency-Key` (minimum 8 characters). Persist one key and the exact payload for a logical operation and reuse it on retry. Not every financial route uses this header: some operations deduplicate by durable entity/reference and state. Header presence alone does not imply payload-bound replay for every route. See [Payments](PAYMENTS.md#idempotency).

Most errors follow:

```json
{ "error": { "code": "FORBIDDEN", "message": "not your event" } }
```

| Condition                             | Status / code                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Invalid DTO or malformed JSON         | `400 VALIDATION`; DTO errors may include `issues`                                |
| JSON body exceeds 1 MiB               | `413 PAYLOAD_TOO_LARGE`                                                          |
| Missing/expired access token          | `401 UNAUTHENTICATED`                                                            |
| Consumed/invalid refresh token        | `401 INVALID_REFRESH`                                                            |
| Inactive account                      | `403 ACCOUNT_INACTIVE`                                                           |
| Wrong role/owner                      | `403 FORBIDDEN` or feature-specific code; some resources deliberately return 404 |
| Missing/short idempotency key         | `400 IDEMPOTENCY_REQUIRED`                                                       |
| Unconfirmed or changed cancellation quote | `409 CANCELLATION_QUOTE_REQUIRED` / `CANCELLATION_QUOTE_CHANGED` |
| Conflicting request/state             | `409` with feature-specific code                                                 |
| Missing injected payment/storage port | `503 PAYMENTS_UNAVAILABLE` / `STORAGE_UNAVAILABLE` where guarded                 |
| Rate limit                            | `429 RATE_LIMITED`                                                               |
| Unknown route                         | `404 NOT_FOUND`                                                                  |
| Unexpected error                      | `500 INTERNAL`, generic public message                                           |

**Exception:** OTP delivery failure returns `502` with `{ "sent": false }`, rather than the standard error envelope. Do not treat every non-2xx response as the same JSON schema.

With Redis, per-IP limits are 300/min globally, 10/min under `/auth`, and 30/min under `/api/payments`. OTP issuance also has a database-backed five-per-hour per-phone limit. Global limiting precedes request-ID middleware; most responses carry `x-request-id`, but early failures may not. Sources: [app](../apps/api/src/app.ts), [rate limiter](../apps/api/src/middleware/rate-limit.ts).

## Health and authentication

Source: [auth routes](../apps/api/src/modules/auth/routes.ts), [OTP service](../apps/api/src/modules/auth/otp.ts), [refresh policy](../apps/api/src/modules/auth/README.md).

| Method | Path                | Access                       | Input / response                                                                         |
| ------ | ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/health`           | Public                       | `{"status":"ok"}`; liveness only                                                         |
| POST   | `/auth/otp/request` | Public                       | `{phone}` → `{sent}`; `devCode` only in isolated `NODE_ENV=test`                         |
| POST   | `/auth/otp/verify`  | Public                       | `{phone,code,role?}` → `{accessToken,refreshToken,user}`                                 |
| POST   | `/auth/refresh`     | Refresh credential           | `{refreshToken}` → successor token pair                                                  |
| POST   | `/auth/logout`      | Presented refresh credential | `{refreshToken}` → 204; best-effort revocation, malformed/expired tokens also return 204 |

`phone` accepts an optional `+` and 7–15 digits. Use one consistent international representation. Codes are six digits. Optional signup role is `CLIENT` or `USHER`, defaulting to CLIENT; it does not change an existing user's role. Admin accounts must already exist. OTP request replaces earlier unconsumed codes for that phone. Development requires delivery; codes are not a console-login mechanism.

Refresh consumes the original JTI atomically. Concurrent reuse has at most one winner. Clients must store the successor pair and serialize refresh attempts. If a committed response is lost, sign in again; replay cannot recover the successor. Logout targets the presented token, not all independent sessions.

## Profile, verification, photos, availability

All routes below require authentication. Source: [profile router](../apps/api/src/modules/profile/routes.ts), [biometric router](../apps/api/src/modules/verification/routes.ts).

| Method | Path                              | Access / contract                                                                                                                           |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/me`                         | Own identity/profile; usher includes wallet, milestones, avatar, portfolio                                                                  |
| PATCH  | `/api/me`                         | Optional `displayName`, `businessName`, `bio`, `yearsExperience`, `state`, `city`, `languages`, `dayRateKobo`; fields apply by profile role |
| POST   | `/api/me/verification/kyc/start`  | Client or usher; `{idType: "NIN" or "BVN",idNumber,givenNames,lastName,referenceId?}` → Smile session/token; optional reference refreshes the active session |
| POST   | `/api/me/verification/upload-url` | Usher; `{kind: "id" or "selfie", contentType, byteSize}` → `{url,key}`; storage required                                                              |
| POST   | `/api/me/uploads/finalize` | Upload owner; `{key}` → `{key}` after existence, size, MIME/signature checks and conditional copy |
| POST   | `/api/me/verification`            | Usher; `{idDocumentUrl,selfieUrl}` containing server-issued keys when storage configured                                                    |
| GET    | `/api/me/verification`            | Client's or usher's own identity submissions, newest first; private download URLs |
| PUT    | `/api/me/verification/account-type` | Client; `{accountType: "INDIVIDUAL" or "BUSINESS"}`; business downgrade is support-only |
| GET    | `/api/me/verification/business` | Client; latest business status and review note, or null |
| POST   | `/api/me/verification/business/upload-url` | Identity-verified business client; `{contentType,byteSize}` for representative authority evidence |
| POST   | `/api/me/verification/business` | Identity-verified business client; `{registeredName,registrationNumber,businessType: "co" or "bn" or "it",representativeRole,authorizationKey,authorized:true}`; durable pending review |
| POST   | `/api/me/photos/upload-url`       | Usher; `{kind: "avatar" or "portfolio",contentType,byteSize}` → `{url,key}`                                                                          |
| PUT    | `/api/me/photos/avatar`           | Usher; `{key}` → `{avatarUrl}`                                                                                                              |
| POST   | `/api/me/photos/portfolio`        | Usher; `{key}` → `{id,imageUrl}`; maximum five photos                                                                                       |
| DELETE | `/api/me/photos/portfolio/:id`    | Usher owns photo; → `{deleted:true}`                                                                                                        |
| POST   | `/api/me/devices`                 | `{fcmToken,platform: "IOS" or "ANDROID"}`; token minimum eight characters                                                                   |
| GET    | `/api/me/availability`            | Usher; optional `from`/`to` query dates (`YYYY-MM-DD`)                                                                                      |
| PUT    | `/api/me/availability`            | Usher; `{date,status}` per shared schema; conflicts with existing bookings can return `409 SCHEDULE_CONFLICT`                               |

Upload flow: request a URL with the exact file `byteSize`, PUT bytes directly to storage with the matching content type, call `/api/me/uploads/finalize`, then submit the verified **key** to the profile/verification/message route. Never save a signed URL as a key. URLs expire after five minutes; unconsumed verified files expire after 24 hours. Limits are 10 MiB for photos/documents and 20 MiB for voice. Photos permit JPEG/PNG/WebP/HEIC/HEIF variants; ID and business-authority documents additionally permit PDF. The API checks a bounded format signature, not malware or complete decoding. Final keys cannot be overwritten with the staging PUT URL. Reference reuse across purposes, owners, scopes or distinct records is rejected; an exact same-reference retry is idempotent. Existing saved files remain readable, but new submissions must follow finalization. See [upload implementation and rollout](../documentation/uploads-2026-09-22.md).

The mobile uploader reads the file once into an ArrayBuffer and sends that buffer with the signed PUT content type. This avoids Expo's native Blob/base64 conversion and prevents a local file's empty or different MIME type from overriding the signed header. File bytes remain unchanged. Server finalization obtains the full size, MIME type, ETag and signature prefix from one bounded ranged GET; it rejects inconsistent range metadata and conditionally copies the exact inspected version. Account status is read in the same query that locks the owner row, preserving serialization with erasure.

Replacement/removal commits the new reference and a deletion intent atomically. Cleanup retries with backoff and defers while any known reference remains. Erasure queues cleanup asynchronously and returns `objectsDeleted: 0` with `objectsPending` for queued final keys; temporary uploads are cleaned separately after their grace period.

`dayRateKobo` is a discovery/display value. Order pricing comes from the event budget captured at confirmation.

## Privacy, legal policy, notifications

Sources: [privacy](../apps/api/src/modules/privacy/routes.ts), [legal](../apps/api/src/modules/legal/routes.ts), [notifications](../apps/api/src/modules/notifications/routes.ts).

| Method | Path                               | Access           | Key | Contract                                                                       |
| ------ | ---------------------------------- | ---------------- | --- | ------------------------------------------------------------------------------ |
| GET    | `/api/me/export`                   | Own account      | —   | Personal-data export                                                           |
| POST   | `/api/me/erase`                    | Own account      | Yes | Pseudonymization; financial history retained                                   |
| GET    | `/api/me/consents`                 | Own account      | —   | Consent state by purpose                                                       |
| POST   | `/api/me/consents`                 | Own account      | —   | `{purpose,granted}`; purpose `PUSH_NOTIFICATIONS`, `MARKETING_EMAIL`, or `SMS` |
| GET    | `/api/legal/privacy-policy`        | Public           | —   | Current published policy                                                       |
| POST   | `/api/legal/privacy-policy/accept` | Authenticated    | —   | Accept current server policy version; no client-selected version               |
| GET    | `/api/me/notifications`            | Own account      | —   | `{notifications,unreadCount}`; latest 50 records                               |
| PATCH  | `/api/me/notifications/:id/read`   | Own notification | —   | `{read:true}`                                                                  |
| POST   | `/api/me/notifications/read-all`   | Own account      | —   | `{read:true}`                                                                  |

Erasure is not a financial-record delete operation. A later authenticated retry can be rejected because the account is now inactive. Do not assume a successful erasure response guarantees every object-store deletion succeeded.

## Events and recruitment

Source: [events router](../apps/api/src/modules/events/routes.ts). All routes require auth. This router mounts even without a payment port.

| Method | Path                           | Access / contract                                                        | Key |
| ------ | ------------------------------ | ------------------------------------------------------------------------ | --- |
| POST   | `/api/events`                  | Client; event DTO → created event                                        | —   |
| GET    | `/api/events`                  | Client's own events; usher discovery with state filter and venue masking | —   |
| GET    | `/api/events/:id`              | Owning client, admin, or eligible/related usher                          | —   |
| PATCH  | `/api/events/:id`              | Owning client; partial event DTO; lifecycle/booking constraints enforced | —   |
| POST   | `/api/events/:id/apply`        | Verified usher; application                                              | —   |
| GET    | `/api/events/:id/applications` | Owning client; applicant profiles without phone numbers                  | —   |
| PATCH  | `/api/applications/:id`        | Owning client; `{status: "SHORTLISTED", "ACCEPTED", or "REJECTED"}`      | —   |
| GET    | `/api/me/applications`         | Usher's applications                                                     | —   |
| POST   | `/api/events/:id/save`         | Usher; save → `{id,saved:true}`                                          | —   |
| DELETE | `/api/events/:id/save`         | Usher; unsave → `{saved:false}`                                          | —   |
| GET    | `/api/me/saved-jobs`           | Usher's saved events                                                     | —   |
| POST   | `/api/events/:id/invite`       | Owning client; `{usherId}`                                               | —   |
| GET    | `/api/me/invitations`          | Verified usher's invitations                                             | —   |
| GET    | `/api/invitations/:id`         | Verified usher who owns invitation                                       | —   |
| PATCH  | `/api/invitations/:id`         | Verified invited usher; `{status: "ACCEPTED" or "DECLINED"}`             | —   |
| POST   | `/api/events/:id/confirm`      | Owning client; `{applicationIds,email}` → checkout snapshot              | Yes |

Example event input (replace the date with a future event date):

```json
{
  "title": "Wedding reception",
  "venue": "Example venue, Lekki",
  "state": "Lagos",
  "category": "Wedding",
  "eventDate": "2027-01-20",
  "startTime": "16:00",
  "endTime": "22:00",
  "headcount": 4,
  "budgetPerHeadKobo": 2000000,
  "accommodation": "PROVIDED",
  "dressCode": "Black formal wear"
}
```

End time must be after start time. Events ending at/after 22:00 must disclose accommodation; both `PROVIDED` and `NOT_PROVIDED` are disclosures. Headcount is 1–100, while one confirmation accepts 1–50 application IDs. Aggregate event budget must fit the money limit. Optional fields and constraints live in [shared DTOs](../packages/shared/src/dto.ts); the confirm route defines its own actual input schema.

Invitation acceptance creates an accepted application. Application acceptance alone is not a paid booking. Precise venue access depends on booking/payment eligibility, not merely application or invitation status.

## Checkout and payments

Source: [payments router](../apps/api/src/modules/payments/http/routes.ts), [checkout](../apps/api/src/modules/payments/checkout.ts). All require auth and an injected payment port; the normal server injects the real HTTP implementation.

| Method | Path                                            | Access / contract                                                       | Key |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------- | --- |
| POST   | `/api/payments/orders/:orderId/charge`          | Order owner; `{email}` → checkout snapshot                              | Yes |
| GET    | `/api/payments/orders/:orderId/checkout`        | Order owner; verifies/reconciles provider evidence and returns snapshot | —   |
| POST   | `/api/payments/orders/:orderId/checkout/resume` | Order owner; resumes the durable original checkout                      | —   |
| GET    | `/api/payments/wallet`                          | Usher; `{availableBalance,pendingEscrow,lifetimeEarned,payoutMode,nextPayoutAt,payoutMinimumKobo,payoutAccount}`; kobo amounts | —   |
| GET    | `/api/payments/wallet/activity`                 | Usher; merged ledger/held activity, bounded list                        | —   |
| GET    | `/api/payments/banks`                           | Authenticated; provider bank directory                                  | —   |
| GET    | `/api/payments/resolve-account`                 | Authenticated; `bankCode`, ten-digit `accountNumber` query              | —   |
| POST   | `/api/payments/bank-accounts`                   | Usher; `{bankCode,accountNumber}`; server resolves account name         | —   |
| GET    | `/api/payments/bank-accounts`                   | Usher's bank accounts, each with `isPayoutAccount`                      | —   |
| PUT    | `/api/payments/payout-account`                  | Usher; `{bankAccountId}`; a verified own account weekly runs pay into   | —   |
| POST   | `/api/payments/withdrawals`                     | Usher; `{bankAccountId,amountKobo}` → persisted receipt. `409 PAYOUTS_SCHEDULED` when `PAYOUT_MODE=weekly` | Yes |
| GET    | `/api/payments/withdrawals`                     | Usher's own transfers, newest first; 25 per page with `cursor` → `{items,nextCursor}` | —   |
| GET    | `/api/payments/withdrawals/:id`                 | One of the usher's own transfers; `404` for any other                   | —   |

Checkout snapshot fields: `orderId`, `eventId`, `bookingIds`, `reference`, `authorizationUrl`, `state`, `expiresAt`, `amountKobo`, `duplicate`. A new confirmation returns 201; replay returns 200. New references use `hq-<order-id>`. `authorizationUrl` is available only in `READY`; consumers must inspect `state` before opening it.

| Checkout state   | Client meaning                                                 |
| ---------------- | -------------------------------------------------------------- |
| `CREATED`        | Durable reservation exists, dispatch not yet started           |
| `INITIALIZING`   | Initialization attempt recorded                                |
| `READY`          | Hosted checkout can be opened                                  |
| `REVIEW`         | Outcome uncertain; retain original order/reference and recover |
| `EXPIRED`        | Reservation conclusively released                              |
| `PAID`           | Charge recorded; staff confirmation may be shown               |
| `REFUND_PENDING` | Late charge for expired reservation; refund in progress        |
| `REFUNDED`       | Refund recorded                                                |

The nominal reservation lifetime is 30 minutes, but elapsed time alone does not establish an unpaid outcome. Browser dismissal, return, or network failure must not trigger a fresh order automatically. The checkout GET is not a passive DB read: it can reconcile provider evidence and progress recovery.

An usher's first registered account becomes their payout account automatically; later accounts must be chosen with `PUT /api/payments/payout-account`. `nextPayoutAt` is the next Thursday 09:00 Lagos run time (ISO). `payoutAccount` is `{id,bankCode,accountName,last4}` or `null`.

Withdrawal receipts include `withdrawalId`, `status`, `amountKobo`, `bankAccountId`, `availableBalance`, and `duplicate`. The same key with a changed bank or amount conflicts. Wallet debit occurs before provider transfer, and uncertainty keeps it reserved. A validated failure/reversal restores funds once. To recover an uncertain request, replay the original request with the same key, as the mobile recovery flow does.

Withdrawal list and detail items are `{id,amount,status,source,reference,createdAt,updatedAt,bank:{code,accountName,last4}}`. `source` is `PAYOUT_RUN` for a weekly payout line and `USHER_REQUEST` for the usher's own withdrawal. Account numbers are never returned in full.

## Bookings, attendance, disputes, reviews

Source: [booking routes](../apps/api/src/modules/bookings/routes.ts). All require authentication and service-level ownership/state checks.

| Method | Path                                 | Access / contract                                             | Key |
| ------ | ------------------------------------ | ------------------------------------------------------------- | --- |
| GET    | `/api/bookings`                      | Client's event bookings or usher's own bookings               | —   |
| GET    | `/api/bookings/:id`                  | Booking party; payment and event details                      | —   |
| POST   | `/api/bookings/:id/checkin/generate` | Client party; attendance code result                          | —   |
| POST   | `/api/bookings/:id/checkin/verify`   | Usher party; `{code}` → `{status:"CHECKED_IN"}`               | —   |
| POST   | `/api/bookings/:id/arrived`          | Usher party; `{arrived:true}`                                 | —   |
| POST   | `/api/bookings/:id/complete`         | Client party; `{status:"COMPLETED"}` while held, `PAID` only after eligible wallet release           | Yes |
| POST   | `/api/bookings/:id/cancel`           | Booking party; cancellation DTO; policy/state/provider checks | Yes |
| POST   | `/api/bookings/:id/disputes`         | Booking party; `{reason,note?}`; freeze eligible escrow       | —   |
| POST   | `/api/bookings/:id/reviews`          | Booking party after payout; `{rating,comment?}`               | —   |

`GET /api/bookings/:id/cancellation-quote` returns the cancellation window, refund, gross usher allocation, platform fee, net payout, processing fee (zero), eligibility and `requiresApproval`. Client cancellation accepts `{reason?, expectedWindow?, expectedRefundKobo?}`; the latter two fields are required for late cancellation. An accepted request returns `operationId`, `outcome`, `settlement` and status `RECORDED`, `PROCESSING`, `AWAITING_APPROVAL` or `FAILED`. Retry preserves the original intent even if the event/time/preview changes. A previously failed request returns `409 CANCELLATION_FAILED` for support review.

Booking detail includes `payoutAvailableAt` (earliest release time, ISO), authoritative `canDispute`, and a safe `cancellation` summary. COMPLETED/HELD bookings remain disputable strictly before scheduled event end + 72 hours. At/after that deadline, release requires completion and no unresolved dispute. PAID/historical released funds are never disputed through this path. Wallet pending totals include HELD/FROZEN allocations and use the reserved cancellation net payout where applicable.

## Chat and media

Sources: [booking routes](../apps/api/src/modules/bookings/routes.ts), [media routes](../apps/api/src/modules/storage/chat-media-routes.ts), [realtime authorization](../apps/api/src/realtime/README.md).

| Method | Path                                              | Contract                                                   |
| ------ | ------------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/bookings/:id/messages`                      | Legacy array: latest 100 authorized messages, oldest first |
| GET    | `/api/bookings/:id/messages/page`                 | `{items,hasMore,oldestCursor,newestCursor,receipts}`; bounded history and incremental sync |
| POST   | `/api/bookings/:id/messages`                      | `{content,contentType?,clientMessageId?}`; `TEXT`, `IMAGE`, or `VOICE` |
| GET    | `/api/bookings/:id/messages/unread`               | `{unread}`                                                 |
| POST   | `/api/bookings/:id/messages/seen`                 | `{upToMessageId?}` → `{seen}`                              |
| POST   | `/api/bookings/:id/media/upload-url`              | `{contentType: "IMAGE" or "VOICE",mimeType,byteSize}` → `{key,url}` |
| GET    | `/api/bookings/:id/messages/:messageId/media-url` | Authorized private download → `{url}`                      |

Chat requires party membership and a messageable booking state. UUID and content validation is shared across REST/socket paths. Text content is 1–4,000 characters. Media messages reference server-issued private keys; use the authorized media route for downloads.

History pages accept `limit` (default 50, maximum 100) and either `before` or `after` (message UUIDs from the same conversation). Without a cursor, the page contains the newest messages; `before` loads older history, while `after` reads forward through missed messages. Every page returns items oldest-first. `hasMore` refers to the requested direction. Optional `receiptIds` is a comma-separated list of at most 100 outgoing message UUIDs; `receipts` returns only the requesting sender's read messages in this conversation. Cursors outside the conversation return `400 INVALID_MESSAGE_CURSOR`.

New clients generate one UUID `clientMessageId` per outgoing message and retain it across retries. REST and Socket.IO use it as the persisted message ID. Matching repeats return the original message; a changed sender, conversation, content, or type returns `409 MESSAGE_ID_CONFLICT`. Appends are serialized per conversation and receive strictly increasing timestamps. A history response may overlap a send acknowledgement or socket event: clients must merge by message ID. Deploy the API page endpoint before distributing the updated mobile build.

## Usher discovery

Source: [usher routes](../apps/api/src/modules/ushers/routes.ts). All require auth.

| Method | Path                      | Contract                                                                                                               |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/ushers`             | Optional `query`, `minRating`, `verified`, `location`, `maxRate`, `availableOn`, `limit`; default limit 20, maximum 50 |
| GET    | `/api/ushers/:id`         | Authorized profile view with portfolio                                                                                 |
| GET    | `/api/ushers/:id/reviews` | Reviews for visible usher                                                                                              |

`maxRate` is integer kobo. Non-admin discovery is verified-only even with `verified=false`. Precise contact data is not a public discovery contract.

## Administration

Source: [admin routes](../apps/api/src/modules/admin/routes.ts). Every route requires ADMIN. These routes use service-level authorization, durable operations, and state guards; they do not currently enforce the HTTP idempotency-key middleware.

| Method | Path                                   | Contract                                                                               |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/admin/stats`                     | Queue counts, users, held escrow, approval threshold, `owedToUshersKobo`, `platformRevenueKobo` (unswept fees), `payoutRunsAwaitingApproval` |
| GET    | `/api/admin/payout-runs`               | Latest 20 weekly payout runs with line count and computed total                       |
| GET    | `/api/admin/payout-runs/:id`           | Lines (usher, masked account, amount, flags, withdrawal status, skip reason), exclusions with reasons, `linesHash`, summary |
| POST   | `/api/admin/payout-runs/build`         | Build today's run (Lagos date) or refresh it while DRAFT; `409 RUN_IN_PROGRESS` if an earlier run awaits approval |
| POST   | `/api/admin/payout-runs/:id/submit`    | `{linesHash}` of the reviewed lines; DRAFT → AWAITING_APPROVAL; `409 RUN_CHANGED` if the lines changed |
| POST   | `/api/admin/payout-runs/:id/reject`    | AWAITING_APPROVAL → DRAFT                                                              |
| POST   | `/api/admin/payout-runs/:id/cancel`    | DRAFT → CANCELLED; balances roll over                                                  |
| POST   | `/api/admin/payout-runs/:id/approve`   | `{linesHash}`; a different admin than the submitter; creates one withdrawal per line, starts transfers in the background |
| POST   | `/api/admin/payout-runs/:id/dispatch`  | 202; restarts transfers that have not reached Paystack                                 |
| POST   | `/api/admin/payout-runs/:id/lines/:withdrawalId/otp` | `{otp}` (4–8 digits); finalizes a transfer waiting for the account owner's OTP. `422 OTP_REJECTED`, `409 OTP_NOT_REQUIRED` |
| POST   | `/api/admin/payout-runs/:id/lines/:withdrawalId/resend-otp` | Ask Paystack to send a new OTP for that transfer                     |
| GET | `/api/admin/observability` | Safe service probes, selected Better Stack statuses and recent Sentry issue summaries; server cache 30 seconds, browser `no-store`. See [Observability](OBSERVABILITY.md#admin-observability-view). |
| GET    | `/api/admin/verifications`             | Client and usher identity submissions; `status`: PENDING (default), APPROVED, REJECTED; sensitive reads audited |
| GET    | `/api/admin/business-verifications` | Same status filter; registry metadata, representative identity reference and private authority evidence; audited, no-store |
| POST   | `/api/admin/business-verifications/:id/refresh` | Refresh existing registry job without starting another paid lookup |
| POST   | `/api/admin/business-verifications/:id/review` | `{decision:"APPROVED" or "REJECTED",note,authorityConfirmed}`; approval requires identity, registry and authority evidence; note 10-1000 characters |
| POST   | `/api/admin/verifications/:id/approve` | Approve submission                                                                     |
| POST   | `/api/admin/verifications/:id/reject`  | `{reason,reasonCode?}`                                                                 |
| GET    | `/api/admin/disputes`                  | Open/under-review by default; `status=ALL` includes closed                             |
| POST   | `/api/admin/disputes/:id/resolve`      | `{outcome: "RELEASE" or "REFUND",resolution}`                                          |
| POST   | `/api/admin/refunds`                   | `{bookingId,amountKobo,reason}`; current service supports full eligible booking refund |
| GET | `/api/admin/cancellations` | Paginated pending cancellation reservations and safe settlement summaries |
| POST | `/api/admin/bookings/:id/cancellation-approval` | `{reason}`; propose the immutable reserved cancellation to a distinct checker |
| GET    | `/api/admin/approvals`                 | `status`: PENDING (default), APPROVED, REJECTED, EXECUTED                              |
| POST   | `/api/admin/approvals/:id`             | `{decision: "approve" or "reject"}`; checker must differ from maker                    |
| GET    | `/api/admin/ledger`                    | Latest escrow rows; default limit 100, capped at 250                                   |
| GET    | `/api/admin/users`                     | Optional `query` over phone/email; latest 100                                          |
| POST   | `/api/admin/users/:id/suspend`         | Set SUSPENDED                                                                          |
| POST   | `/api/admin/users/:id/reinstate`       | Set ACTIVE                                                                             |
| GET    | `/api/admin/milestone-tiers`           | Configured reward tiers                                                                |
| POST   | `/api/admin/milestone-tiers`           | `{threshold,name,rewardType,description?,active?}`                                     |
| PATCH  | `/api/admin/milestone-tiers/:id`       | Partial tier DTO                                                                       |
| DELETE | `/api/admin/milestone-tiers/:id`       | Soft deactivate                                                                        |
| GET    | `/api/admin/milestones`                | Physical reward queue; UNLOCKED default or `status=FULFILLED`                          |
| POST   | `/api/admin/milestones/:id/fulfill`    | Mark an unlocked reward fulfilled                                                      |

Every weekly payout run needs two admins, whatever its total: one submits the exact lines (`linesHash`) and a different admin approves them. See [weekly payout runs](PAYMENTS.md#weekly-payout-runs).

Amounts **greater than** 5,000,000 kobo (₦50,000) require a different admin to approve. For client cancellations this threshold applies to the original gross allocation, including a zero-refund cancellation, and the first accepted quote survives delayed approval. An early usher-favour dispute resolution retains HELD funds until the shared deadline. An approval decision does not itself establish provider settlement: `APPROVED` remains until execution completes. Re-read state and consult [Operations](OPERATIONS.md).

## Webhooks and realtime

| Method | Path                 | Authentication                                         |
| ------ | -------------------- | ------------------------------------------------------ |
| POST   | `/webhooks/paystack` | HMAC-SHA512 over raw body using `x-paystack-signature` |
| POST   | `/webhooks/kudisms` | Unsigned delivery-status telemetry only; never changes authentication or triggers SMS. JSON, maximum 16 KiB. |
| POST   | `/webhooks/smile-id/:referenceId/:callbackKey`    | Smile signed headers + secret attempt callback; server retrieves the authoritative job status    |

Provider payloads are not user-authenticated requests. Do not synthesize a successful payment callback to resolve uncertain money. Paystack callbacks deduplicate effects and can return 500 while authoritative evidence is unavailable, allowing retry. Smile ID unknown/duplicate/superseded references do not overwrite current identity state.

Socket.IO runs on the API HTTP server. Session-bound tokens, authorization on private delivery, rate limits, payload limits, and rollout compatibility are documented in the [realtime note](../apps/api/src/realtime/README.md). The [event catalogue](../apps/api/src/realtime/events.ts) defines lifecycle events such as `booking.confirmed`, `order.paid`, `withdrawal.completed`, and chat events such as `message:new`. Receiving a signal should trigger reconciliation/refetch; absence of a signal proves nothing about committed state.

## Marketplace profiles and hiring (2 October 2026)

- `PATCH /api/me` accepts optional usher `physicalAttributes` (gender, age, heightCm, shoeSizeUk, bodyType, dressSize, skinTone, hairstyle). Send an object to replace these fields or `null` to clear them. These details are voluntary and do not affect automatic eligibility. Client edits accept `description`, `position`, `city`, and private `contactEmail` alongside existing names. Client avatars use the existing `/api/me/photos/upload-url`, upload-finalization, and `/api/me/photos/avatar` flow; client portfolio uploads are rejected.
- `GET /api/clients/:id` returns public profile details, verification labels, signed avatar URL, ratings, `jobsPosted`, and `activeJobs`. Contact email, phone, user ID and raw storage keys are excluded. Other users cannot read suspended/unverified client profiles. `GET /api/me` includes the owner's private contact email.
- `GET /api/events?query=...` searches title, category, state and client names (case insensitive, at most 120 characters). Existing state/role/status boundaries and venue masking remain in force. Precise venue is deliberately not searchable.
- Event create/edit accepts `presentation: { attributes, rationale }`; rationale is required (10–500 characters). `presentation: null` removes preferences. A disabled category rejects preferences, including edits that retain them; removing them remains possible.
- `POST /api/applications/:id/withdraw` is owner-only and repeatable. It withdraws an ordinary application or accepted invitation before booking. Pending-payment and subsequent live bookings must use the booking lifecycle instead. Reapplying after an ordinary withdrawal is allowed; a declined invitation cycle remains closed.
- `POST /api/events/:id/invite-batch` accepts 1–50 distinct `usherIds`. Ownership, eligibility and schedules are checked under the recruitment locks; the batch is atomic. Retrying preserves existing SENT invitations. A worker who has already responded must be removed from the batch.
- `PATCH /api/invitations/:id` accepts `{ status: 'DECLINED', reason?, note? }` or `{ status: 'ACCEPTED' }`. New mobile clients collect a reason; status-only declines remain compatible with older clients. Notes are limited to 500 characters. The original reply survives retries. Owners see reasons/notes in the event's invitation list.
- `POST /api/reports` accepts `{ targetType: 'JOB' | 'WORKER', targetId, reason, details }`. Workers report readable jobs; verified clients report active verified workers. A booking is not required. One report per reporter/target is retained, including after resolution; retries return its ID and status. The response excludes moderation notes.
- Admins list reports at `GET /api/admin/reports?status=OPEN&cursor=...` (50 per page) and review at `PATCH /api/admin/reports/:id` with `{ expectedStatus, status, note }`. Stale/closed reviews return 409. Outcomes are UNDER_REVIEW, RESOLVED or DISMISSED and do not affect funds. `GET/PUT /api/admin/presentation-policies` lists or sets `{ category, enabled }`, with categories normalized to lowercase.

Mobile sharing uses `hirequick://jobs/<event-id>`. A pending job survives sign-in/profile setup for up to 24 hours. This is an installed-app link, not a hosted web listing or universal link.
