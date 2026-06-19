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
| Unknown route | 404 | `NOT_FOUND` |
| Unhandled error | 500 | `INTERNAL` (generic message) |

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

### `POST /api/me/verification` (usher)
Submit identity verification. Body: `{ "idDocumentUrl", "selfieUrl" }` (URLs;
the storage layer issues these as signed URLs — currently passed through as
plain URLs). Response: `{ "id", "status": "PENDING" }`.

### `GET /api/me/verification` (usher)
List the caller's verification submissions (newest first).

---

## Events, Applications & Invitations — `/api`
All require auth. Event routes mount only when a Paystack port is configured.

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

### `POST /api/bookings/:id/disputes` (client or usher party)
Open a dispute → **freezes the escrow** (booking → `DISPUTED`,
`escrowStatus = FROZEN`). Body: `{ "reason": "...", "note": "..."? }`.
Response: `201 { "id": "<disputeId>" }`.

> **Attendance / completion windows are also driven by scheduled jobs**
> (auto-complete, no-show) rather than only by these endpoints — see
> [`ARCHITECTURE.md`](./ARCHITECTURE.md#scheduled-jobs).

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
Require auth **and** `ADMIN` role. Every action is audit-logged.

### `POST /api/admin/verifications/:id/approve`
Approve an usher verification → usher `verificationStatus = VERIFIED` (now
discoverable/payable). Response: `{ "id", "status": "APPROVED" }`.

### `POST /api/admin/verifications/:id/reject`
Body: `{ "reason": "..." }`. Marks the verification and usher `REJECTED`.
Response: `{ "id", "status": "REJECTED" }`.

---

## Webhooks — `/webhooks/paystack`
No auth header — authenticated by **HMAC-SHA512 signature** over the raw body
(`x-paystack-signature`). Mounted with `express.raw` before `express.json`.
Handles `charge.success`, `transfer.success`, `transfer.failed`. Bad signature →
`401`; bad JSON → `400`; handler error → `500` (so Paystack retries). Duplicate
events are deduped and return `200`. See
[`PAYMENTS.md` §6](./PAYMENTS.md#6-the-webhook-pipeline).
