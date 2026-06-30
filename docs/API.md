# API Reference

HTTP reference for `@hq/api`. The base URL in development is
`http://localhost:4000`. All request/response bodies are JSON unless noted.

For the money concepts behind these endpoints, see [`PAYMENTS.md`](./PAYMENTS.md).

---

## Conventions

**Auth.** Most endpoints require a Bearer access token:

```
Authorization: Bearer <accessToken>
```

`requireAuth` verifies the token and attaches the caller's `{ userId, role }`.
Admin endpoints additionally require the `ADMIN` role (`requireRole`).

**Roles.** `CLIENT`, `USHER`, `ADMIN`. RBAC is enforced per route; a wrong role
returns `403 FORBIDDEN`.

**Idempotency.** Money-mutating endpoints require an `Idempotency-Key` header
(min 8 chars). Reuse the same key to safely retry a request.

```
Idempotency-Key: <unique-per-logical-operation>
```

**Errors.** Every error is a leak-free envelope; internals are never exposed:

```json
{ "error": { "code": "FORBIDDEN", "message": "not your event" } }
```

| Situation | Status | Code |
| --- | --- | --- |
| Zod validation failure | 400 | `VALIDATION` (with `issues`) |
| Missing/invalid token | 401 | `UNAUTHENTICATED` |
| Wrong role / not your resource | 403 | `FORBIDDEN` (or `NOT_A_CLIENT` / `NOT_AN_USHER` / `NOT_VERIFIED`) |
| Missing idempotency key | 400 | `IDEMPOTENCY_REQUIRED` |
| Too many requests | 429 | `RATE_LIMITED` |
| Payments port not configured | 503 | `PAYMENTS_UNAVAILABLE` (e.g. confirm-batch) |
| Unknown route | 404 | `NOT_FOUND` |
| Unhandled error | 500 | `INTERNAL` (generic message) |

**Rate limiting.** When Redis is configured, three tiers apply (per client IP):
a lenient **global** ceiling on everything, a strict **auth** limiter on
`/auth/*` (OTP/login/refresh are brute-force targets), and a moderate **money**
limiter on `/api/payments/*`. Exceeding a tier returns `429 RATE_LIMITED` with
`RateLimit-*` headers. In dev/test without Redis the limiters pass through.

**Request correlation.** Every response carries an `x-request-id` header (echoed
from the request or generated).

---

## Health

### `GET /health`
No auth. Liveness probe.

```json
{ "status": "ok", "service": "hirequick-api" }
```

---

## Auth — `/auth`

Phone + OTP. In development the OTP is logged to the server console and returned
as `devCode` (never returned in production).

### `POST /auth/otp/request`
Body: `{ "phone": "+2348012345678" }`
Rate-limited to 5 requests/hour per phone → `429 RATE_LIMITED`.
Response: `{ "sent": true, "devCode": "123456" }` (devCode dev-only).

### `POST /auth/otp/verify`
Body: `{ "phone": "+234...", "code": "123456", "role": "CLIENT" | "USHER" }`
(`role` optional; used only when creating a brand-new user — defaults to
`CLIENT`. A new `USHER` is created with a wallet; a new `CLIENT` with a profile.)
Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "role": "USHER", "phone": "+234..." }
}
```

### `POST /auth/refresh`
Body: `{ "refreshToken": "..." }`
Rotates the pair (issues a fresh access **and** refresh token). Suspended/unknown
users → `401 INVALID_REFRESH`.

### `POST /auth/logout`
`204 No Content`. Stateless — logout is a client-side token discard. (A refresh
denylist is a documented Phase 9 hardening item.)

---

## Profile — `/api/me`
All require auth.

### `GET /api/me`
Returns the caller's user + `client` and/or `usher` (with wallet) records.

### `PATCH /api/me`
Body (all optional): `{ "displayName", "bio", "yearsExperience" }`.
`displayName` updates the client profile; `bio`/`yearsExperience` update the
usher profile. Response: `{ "updated": true }`.

### `POST /api/me/verification/upload-url` (usher)
Request short-lived presigned upload URLs for KYC documents. Body names the
document kind(s) and content type; the response returns the URL(s) to PUT to and
the server-owned object key(s) to submit back. (When storage is unconfigured the
flow falls back to plain URLs.)

### `POST /api/me/verification` (usher)
Submit identity verification, referencing the keys/URLs from the upload step.
Response: `{ "id", "status": "PENDING" }`.

### `GET /api/me/verification` (usher)
List the caller's verification submissions (newest first).

### Photos (usher) — `/api/me/photos`
- `POST /api/me/photos/upload-url` — presigned upload URL for an avatar or
  portfolio photo (server-owned key, scoped to the usher).
- `POST /api/me/photos/avatar` — set the profile avatar from an uploaded key.
- `POST /api/me/photos/portfolio` — add a portfolio photo.
- `DELETE /api/me/photos/portfolio/:id` — remove a portfolio photo.

### `PUT /api/me/availability` (usher)
Set the usher's availability status (used by discovery/booking).

### `POST /api/me/devices`
Register a device push token (`{ token, platform }`) for notifications.

### Privacy (data-subject rights) — `/api/me`
- `GET /api/me/export` — export the caller's personal data (NDPR access right).
- `POST /api/me/erase` — erase the caller's account. Erasure **pseudonymizes**
  rather than deletes, because financial/audit records are retained for the
  legally-required window (TRD §14).

---

## Events, Applications & Invitations — `/api`
All require auth. The events router mounts **unconditionally** (discovery and
applications don't need payments); only `confirm` depends on a Paystack port and
returns `503 PAYMENTS_UNAVAILABLE` when none is configured.

### `POST /api/events` (client)
Create a multi-staff event. Body (`createEventSchema`):

```json
{
  "title": "Oriental Hotel Wedding",
  "venue": "Oriental Hotel, Lekki",
  "category": "Wedding",
  "eventDate": "2026-07-01",
  "startTime": "16:00",
  "endTime": "22:00",
  "headcount": 10,
  "budgetPerHeadKobo": 1500000,
  "dressCode": "Black tie",
  "requirements": "Prior wedding experience"
}
```
`endTime` must be after `startTime`. Created with status `OPEN`.

### `GET /api/events`
Clients see their own events; ushers see `OPEN` / `PARTIALLY_STAFFED` events.

### `GET /api/events/:id`
Event detail with application/booking counts.

### `POST /api/events/:id/apply` (verified usher)
Usher applies (upsert → `APPLIED`). Requires `verificationStatus === 'VERIFIED'`
(else `403 NOT_VERIFIED`).

### `GET /api/events/:id/applications` (client, own event)
List applications with usher phone.

### `PATCH /api/applications/:id` (client, own event)
Body: `{ "status": "SHORTLISTED" | "ACCEPTED" | "REJECTED" }`.

### `GET /api/me/applications` (usher)
The caller's own applications across events.

### `POST /api/events/:id/save` · `GET /api/me/saved-jobs` (usher)
Bookmark an event and list saved events.

### `POST /api/events/:id/invite` (client, own event)
Body: `{ "usherId": "<uuid>" }`. Upserts an invitation (`SENT`).

### `PATCH /api/invitations/:id` (usher)
Body: `{ "status": "ACCEPTED" | "DECLINED" }`. Accepting an invitation creates an
`ACCEPTED` application — so both hiring models converge on the same confirm input.

### `POST /api/events/:id/confirm` (client) · Idempotency-Key required
Confirm a batch of accepted ushers → creates an `Order` + `Booking`s and
initializes the Paystack charge. Body:

```json
{ "applicationIds": ["<uuid>", "..."], "email": "client@example.com" }
```
Response:

```json
{
  "orderId": "...",
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "hq_<orderId>",
  "bookingIds": ["...", "..."]
}
```
The client opens `authorizationUrl` to pay; the HOLD into escrow happens on the
`charge.success` webhook.

---

## Bookings — `/api`
All require auth.

### `GET /api/bookings`
Ushers see their own bookings; clients see bookings on their events.

### `GET /api/bookings/:id`
Booking detail (event, usher, payment). Only the booking's client or usher may
view it.

### `POST /api/bookings/:id/checkin/generate` (client)
Generate a 6-digit attendance code for a `CONFIRMED` booking (valid 8h).
Response: `{ "generated": true, "devCode": "123456" }` (devCode dev-only).

### `POST /api/bookings/:id/checkin/verify` (usher)
Body: `{ "code": "123456" }`. On success the booking → `CHECKED_IN`
(`attendanceMethod = OTP`). Response: `{ "status": "CHECKED_IN" }`.

### `POST /api/bookings/:id/arrived` (usher)
Usher self-asserts arrival (D1 passive-client path). Allowed when `CONFIRMED` or
`CHECKED_IN`. Response: `{ "arrived": true }`.

### `POST /api/bookings/:id/complete` (client)
Client confirms completion of a `CHECKED_IN` booking → releases payout to the
usher's wallet (`releaseBooking`). Response: `{ "status": "PAID" }`.

### `POST /api/bookings/:id/cancel` (client or usher party)
Cancel a booking. The refund/payout outcome is computed from the
[cancellation policy matrix](./PAYMENTS.md#policy-matrix) by actor and window.

### `POST /api/bookings/:id/disputes` (client or usher party)
Open a dispute → **freezes the escrow** (booking → `DISPUTED`,
`escrowStatus = FROZEN`). Body: `{ "reason": "...", "note": "..."? }`.
Response: `201 { "id": "<disputeId>" }`.

### `POST /api/bookings/:id/reviews`
Leave a review for the counterparty on a completed booking (drives the usher's
`ratingAvg` / `ratingCount`).

### Booking chat — `/api/bookings/:id/messages`
REST companions to the realtime chat (the live path is Socket.IO; see below):
- `GET /api/bookings/:id/messages` — message history (booking parties only).
- `POST /api/bookings/:id/messages` — send a message.
- `POST /api/bookings/:id/messages/seen` — mark messages seen up to an id.
- `GET /api/bookings/:id/messages/unread` — unread count for the badge.

> **Attendance / completion windows are also driven by scheduled jobs**
> (auto-complete, no-show) rather than only by these endpoints — see
> [`ARCHITECTURE.md`](./ARCHITECTURE.md#scheduled-jobs).

---

## Ushers (discovery) — `/api`
All require auth. Read-only public-ish surface for client-side discovery.

### `GET /api/ushers`
Search/browse usher cards (id, displayName, bio, yearsExperience, ratingAvg,
ratingCount, completedJobsCount, avatar). Supports discovery filters.

### `GET /api/ushers/:id`
A single usher's public profile (card + portfolio photos, presigned for reading).

### `GET /api/ushers/:id/reviews`
Reviews an usher has received.

---

## Payments — `/api/payments`
All require auth. Mount only when a Paystack port is configured.

### `POST /api/payments/orders/:orderId/charge` · Idempotency-Key required
Initialize a Paystack charge for a `PENDING` order. Body: `{ "email": "..." }`.
Response: `201 { "authorizationUrl", "reference" }`.

### `POST /api/payments/bank-accounts` (usher)
Register a bank account as a Paystack transfer recipient. Body
(`bankAccountSchema`): `{ "bankCode", "accountNumber" (10 digits), "accountName" }`.

### Withdrawals (usher)
Withdraw available wallet balance to a registered bank account
(`withdrawSchema`: `{ "bankAccountId", "amountKobo" }`). The wallet is debited
immediately; the `transfer.success` / `transfer.failed` webhook finalizes the
status (a failure reverses the debit). See
[`PAYMENTS.md` §4](./PAYMENTS.md#withdrawals).

---

## Admin — `/api/admin`
Require auth **and** `ADMIN` role. Every action is written to the hash-chained
audit log. This surface backs the `apps/admin` console.

**Verifications**
- `GET /api/admin/verifications` — queue of pending KYC submissions.
- `POST /api/admin/verifications/:id/approve` — usher `verificationStatus =
  VERIFIED` (now discoverable/payable).
- `POST /api/admin/verifications/:id/reject` — body `{ "reason" }`; marks usher
  `REJECTED`.

**Disputes**
- `GET /api/admin/disputes` — open disputes (frozen escrow).
- `POST /api/admin/disputes/:id/resolve` — resolve toward release / refund /
  cancel per the booking state machine; unfreezes the escrow.

**Refunds**
- `POST /api/admin/refunds` — issue a manual/administrative refund on a booking.

**Two-person approvals**
- `GET /api/admin/approvals` · `POST /api/admin/approvals/:id` — review and
  approve/reject sensitive actions that require a second admin.

**Rewards (loyalty)**
- `GET`/`POST` `/api/admin/milestone-tiers` · `PATCH /api/admin/milestone-tiers/:id`
  — manage loyalty tiers.
- `GET /api/admin/milestones` · `POST /api/admin/milestones/:id/fulfill` — see
  unlocked milestones and mark physical rewards fulfilled.

**Operations**
- `GET /api/admin/stats` — operational dashboard metrics.
- `GET /api/admin/ledger` — inspect ledger entries.
- `GET /api/admin/users` — user directory.

---

## Realtime (Socket.IO)
Clients connect to the same origin over Socket.IO, authenticating with the
**access JWT** on connect. Joining `booking:<id>` requires being a party to the
booking. Client→server events: `room:join`, `message:send`, `message:seen`,
`typing:start`/`typing:stop`. Server→client events (catalogue in
`realtime/events.ts`): booking lifecycle (`booking.confirmed`, `booking.checked_in`,
`booking.completed`, `booking.paid`, `booking.cancelled`, `booking.no_show`,
`booking.disputed`, `booking.dispute_resolved`, `order.paid`), withdrawals
(`withdrawal.requested/completed/failed`), and chat (`message:new`,
`message:seen`, `typing`, `conversation.unread`). Pushes are convenience signals;
the REST/DB state remains authoritative.

---

## Webhooks — `/webhooks/paystack`
No auth header — authenticated by **HMAC-SHA512 signature** over the raw body
(`x-paystack-signature`). Mounted with `express.raw` before `express.json`.
Handles `charge.success`, `transfer.success`, `transfer.failed`. Bad signature →
`401`; bad JSON → `400`; handler error → `500` (so Paystack retries). Duplicate
events are deduped and return `200`. See
[`PAYMENTS.md` §6](./PAYMENTS.md#6-the-webhook-pipeline).
