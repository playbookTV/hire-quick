# Application workflows

[Documentation index](README.md) · [API](API.md) · [Current status](STATUS.md)

These journeys describe current application/backend behavior and the recovery expectations contributors should preserve. Use synthetic fixtures and provider TEST mode for acceptance checks. They are not authorization to transact against live customer records.

## Sign in and establish a role

1. Request an OTP for a reachable phone. Production/development needs delivery; isolated tests receive `devCode`.
2. Verify the code. A new user can choose CLIENT or USHER; an existing user's role is preserved. ADMIN is provisioned separately.
3. Persist the access/refresh pair and load `/api/me`. Read and accept the current privacy-policy version as required by the app flow.
4. On access expiry, serialize refresh and save the successor pair. On logout, submit the current refresh token and clear local session data. A lost response after committed rotation requires OTP login again.

Acceptance: incorrect/expired codes fail, a newly requested code supersedes the older code, an inactive account cannot continue, and account switching does not reuse another user's cached data or pending payment state.

## Usher onboarding and discovery

The usher completes profile details, submits document or biometric verification, uploads avatar/portfolio through server-issued keys, and sets availability. Verification uses server/admin/provider state, not a client-side success screen. Discovery for non-admin users is verified-only.

Profile day rate helps discovery; it does not set the charged booking amount. Events use their own per-head budget. Availability changes and confirmation share scheduling guards. A user cannot mark a booked day unavailable to silently cancel a booking.

Acceptance: another user's photo/document key is rejected; a rejected or pending profile is not exposed through ordinary verified discovery; private verification documents remain behind authenticated and authorized access.

## Client creates and staffs an event

The client enters event date, start/end times, headcount, per-head kobo budget, and relevant requirements. An event ending at/after 22:00 requires an accommodation disclosure. End time must follow start time.

Ushers apply, or the client sends invitations. An accepted invitation becomes an accepted application. The client reviews and accepts applicants, then confirms a selection. Confirmation rechecks all applicants, available capacity, account/verification/scheduling eligibility, and current invitation state inside the locking workflow. A changed selection is rejected rather than partially charged.

Acceptance: over-capacity, conflicting schedules, stale/rejected applicants, and unauthorized event edits fail. Applications do not disclose usher phone numbers. Applying, saving, or receiving an invitation does not unlock a precise venue.

## Checkout and booking confirmation

Confirmation sends application IDs and email with a persisted logical idempotency key. The backend creates a batch order, pending-payment bookings, and durable checkout. The app opens the authorization URL only in READY state.

After browser return or restart, read/resume the **original** order. A browser close does not prove payment failure. Verified provider evidence records per-booking HOLDs and confirmation. The client should display the returned state, including REVIEW when the outcome is uncertain.

A conclusively unpaid expired checkout frees reservations. A later successful charge enters refund recovery instead of confirming staff. Preserve that distinction in copy and support handling.

Acceptance: double taps and lost responses recover the same order; changed payload under the same key conflicts; restart restores the pending action; another user cannot recover the order; a late payment never overbooks staff.

## Event day and earnings

The client generates a booking-bound attendance code; the usher submits it to check in. The usher can also assert arrival independently. Client completion releases eligible escrow into the wallet. The worker considers attendance/arrival for auto-completion after event end plus the default 60-minute grace. No-show handling instead uses event **start** plus grace and requires no verified check-in and no asserted arrival.

A PAID booking means released wallet earnings. It does not mean the usher's bank received money. Disputed/frozen or refund-reserved bookings must not be released through an alternative attendance path.

Acceptance: codes are booking-bound, incorrect codes do not advance state, repeated completion cannot double-credit, and a legitimately asserted arrival prevents erroneous no-show handling.

## Wallet withdrawal

The usher selects a bank and ten-digit account number; the backend resolves account name and registers the destination. Withdrawal validates ownership, bank verification, optional BVN gate, amount, and available balance.

The mobile flow saves the key and payload before dispatch. The ledger reserves money by debiting the wallet before provider transfer. Receipt states distinguish requested/processing/paid/failed. Uncertain responses retain the original request for recovery across screen close or app restart. Confirmed failure/reversal returns the debit once.

Acceptance: concurrent withdrawals cannot spend the same balance twice, altered-bank retries conflict, pending requests survive restart, and dismissing an old receipt cannot erase a newer pending action.

## Cancellation and disputes

Read the [policy matrix and implementation limits](PAYMENTS.md#policy-matrix). Full eligible booking refunds are implemented. Client cancellations within 48 hours require split compensation under policy, but the current service rejects those automated cancellations for support handling. Never display a completed refund merely because an operation was requested.

An eligible dispute freezes escrow for admin review. Although the specification describes a 72-hour dispute window, current booking transitions prohibit disputes after COMPLETED/PAID until a clawback model exists. Support must not promise an API path that is not implemented.

## Admin operations

Admins review verification submissions, disputes, refunds, users, ledger entries, and reward fulfillment. Monetary actions over ₦50,000 require a different admin checker. APPROVED and EXECUTED are different outcomes; re-read state after interruptions. Physical rewards remain in an unlock queue until fulfillment is recorded; tier deletion deactivates rather than erases history.

Acceptance: a maker cannot approve their own action, uncertain requests retain recoverable state, sensitive document access is audited, and terminal actions do not repeat financial effects.

## Messages, notifications, and privacy

Booking chat and media access require current party/state authorization. The backend supports realtime, but mobile currently polls relevant data; verify actual device update behavior. Notification inbox persistence and provider push delivery are separate outcomes.

Users can inspect consent, export their data, and request erasure. Erasure removes/pseudonymizes current identifying data while retaining financial/audit records. It also changes account access; an old token is not a perpetual data-access capability. Storage cleanup is best effort and requires operational follow-up on failures.
