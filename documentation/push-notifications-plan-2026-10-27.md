# Push notification scenarios — 27 October 2026

A map of every push notification the client and usher apps should send, built from the specification catalogues ([PRD §10](02-HireQuick-PRD.md), [UXRD §10](03-HireQuick-UXRD.md), [TRD §13](04-HireQuick-TRD.md)) and the lifecycle events the API already emits. Status: planning, nothing in this document is built yet unless a row says **Built**.

**Update, 27 October 2026:** the owner chose Expo's push service with `expo-notifications` (open decision 1). Phase 0 is implemented and not deployed; see [push notifications](../docs/PUSH-NOTIFICATIONS.md). It also fixed U2's lock-screen text and gave U8 its booking link. Phase 0 does not change which rows are **Built**.

## Where things stand

- The API can send FCM HTTP v1 pushes (`notifications/brevo.ts`) and sends only to users with an explicit `PUSH_NOTIFICATIONS` consent (`notifications/service.ts`). `POST /api/me/devices` and `POST /api/me/consents` exist.
- **The mobile app never asks for push permission and never registers a device**, so no push reaches a phone today, including the ones marked **Built** below. Those rows already write the inbox row and email.
- Pushes carry only a title and body: no notification type, no deep-link target, no Android channel or iOS category. Tokens FCM rejects are logged, not deleted.
- The API emits Socket.IO events for check-in, completion, cancellation, no-show and dispute resolution, but the mobile app polls instead of subscribing, and most of those moments have no notification.

## Rules for every push

1. **A push never changes state.** Every tap and every button opens a screen. Accepting an invitation, applying, paying, checking in and confirming completion happen in the app after the person has seen the details. A lock-screen accept would skip the dress code, late-night accommodation and pay details, and its errors would have nowhere to show.
2. **Lock-screen-safe text.** Pushes to ushers never contain the venue (it stays masked until escrow is held, PRD §7/§13), client-written text such as event titles, identity numbers or verification reasons. Use category, state, date, time and pay instead, for example "Brand activation · Lagos · Sat 8 Nov, 16:00 · ₦25,000".
3. **Every push carries a target.** Payload data is `{ type, targetType, targetId, dispatchId }`. The app routes taps through `lib/notifications.ts` `notificationRoute`, which must become role-aware (`event` opens the client event screen today; ushers need the job screen).
4. **Inbox row or push-only.** Lifecycle events get an inbox row and a push. High-volume signals (job alerts, chat) are push-only. Money, verification, cancellation and dispute events also get an email.
5. **Idempotent and capped.** Each send has a dedupe key (`kind:targetId:userId`, plus the reminder slot for scheduled sends), so job retries never double-send. Job alerts have a daily cap and quiet hours; booking, money and attendance pushes are never delayed.
6. **Consent stays the single on/off switch.** Category toggles (Job alerts, Event reminders, Messages) are preferences inside it. Bookings and payments cannot be muted separately while push is on.

## Usher scenarios

### Finding work

| # | Scenario | Trigger | Push text (draft) | Opens | Inbox · email | Phase | Today |
|---|---|---|---|---|---|---|---|
| U1 | New job in your state | Event created `OPEN`; picked up by the `jobAlerts` job after a 2 min grace | "New job in Lagos" / "Brand activation · Sat 8 Nov, 16:00 · ₦25,000 per head" | Buttons **View details** (job screen) and **Apply** (job screen with the apply confirmation open) | Push only | 2 | Spec gap (PRD §5: "matching ushers are notified") |
| U2 | Invitation received | `POST /events/:id/invite`, `invite-batch` | "You've been invited to a job" / "Brand activation · Sat 8 Nov, 16:00. Tap to view and respond." | Button **View invitation** only; no Accept/Decline in the push | Inbox · email | 1 (copy fix) | **Built**; current text includes the client's event title, which rule 2 removes |
| U3 | Application shortlisted | Client sets application `SHORTLISTED` (`PATCH /applications/:id`) | "You've been shortlisted" / "Brand activation · Sat 8 Nov. The client is reviewing applicants." | Job screen | Inbox | 1 | Spec gap |
| U4 | Selected for a job | Client sets application `ACCEPTED` | "You've been selected" / "Brand activation · Sat 8 Nov. Your booking confirms once the client pays." | Job screen | Inbox | 1 | New (closes the gap between selection and payment) |
| U5 | Not selected | Client sets application `REJECTED` | — | — | Inbox only, no push | 1 | New |
| U6 | Job you applied to changed | Client edits date, time or pay while your application is open | "A job you applied to changed" / "Check the new date and pay still work for you." | Job screen | Inbox | 3 | New |
| U7 | Selection lapsed | A checkout reservation holding your slot expires unpaid ([checkout recovery](checkout-recovery-2026-09-14.md)) | "This selection lapsed" / "The client didn't complete payment. The job may reopen." | Job screen | Inbox | 3 | New |

### Booked work

| # | Scenario | Trigger | Push text (draft) | Opens | Inbox · email | Phase | Today |
|---|---|---|---|---|---|---|---|
| U8 | Booking confirmed | Client's payment lands in escrow (`payments/checkout.ts`) | "You've been booked" / "Brand activation · Sat 8 Nov, 16:00. Venue and details are in the app." | Booking screen | Inbox · email | — | **Built** |
| U9 | Event tomorrow | `reminders` job, start − 24 h | "Tomorrow, 16:00" / "Check the dress code and plan your route." | Booking screen | Inbox | 2 | Spec gap ("attendance pending") |
| U10 | Event starts soon | `reminders` job, start − 2 h | "Starts at 16:00" / "Tap I've arrived when you get there." | Booking screen | Push only | 2 | New |
| U11 | Arrival not recorded | `reminders` job, start + 20 min and start + 40 min, no check-in or asserted arrival | "Mark your arrival" / "Tap I've arrived or check in before 17:00, or you may be marked no-show." | Booking screen | Push only; iOS time-sensitive | 1 | New. No-show fires at start + 60 min (`DEFAULT_GRACE_MINUTES`); this protects ushers from wrongful no-shows |
| U12 | Checked in | Usher submits the client's code (`verifyCheckin`) | — | — | None: the usher is in the app at that moment | — | Spec item; no push recommended |
| U13 | Job complete | `BOOKING_COMPLETED` (client confirms or auto-complete) | "Job complete" / "Your pay is released to your wallet after the 72-hour review window, on Tue 11 Nov." | Booking screen | Inbox | 1 | New |
| U14 | Booking cancelled | `cancelBookingByClient`, admin-approved cancellation | "Booking cancelled" / "The Sat 8 Nov booking was cancelled. Any cancellation pay goes to your wallet." | Booking screen | Inbox · email | 1 | Spec gap ("cancellation notice") |
| U15 | Marked no-show | `noShowSweep` | "Marked no-show" / "You weren't checked in for Sat 8 Nov. If this is wrong, contact support from the booking." | Booking screen | Inbox · email | 1 | New |
| U16 | New message | Booking chat message | "New message on a booking" | Conversation | Push only, one notification per booking conversation | — | **Built** |
| U17 | Dispute opened | `openDispute`, sent to the party that didn't open it | "A booking is under review" / "Funds stay on hold until it resolves." | Booking screen | Inbox · email | — | **Built** |
| U18 | Dispute resolved | `resolveDispute` (`BOOKING_DISPUTE_RESOLVED`) | "Review finished" / "Open HireQuick to see the outcome." | Booking screen | Inbox · email | 1 | Spec gap |
| U19 | Rate your client | `reminders` job, end + 2 h on completed bookings without a review | "How did Sat 8 Nov go?" / "Rate the client to help other ushers." | Review screen | Inbox | 2 | Spec gap ("review reminder") |

### Money

| # | Scenario | Trigger | Push text (draft) | Opens | Inbox · email | Phase | Today |
|---|---|---|---|---|---|---|---|
| U20 | Pay released to wallet | 72 h window closes (`releaseBooking`) | "Pay released" / "₦25,000 has been added to your wallet." | Wallet | Inbox · email | — | **Built** |
| U21 | Weekly payout sent | Payout line succeeds (Paystack webhook) | "Payout sent" / "₦75,000 has been sent to your bank account." | Withdrawal details | Inbox · email | — | **Built** |
| U22 | Weekly payout failed | Payout line fails | "Payout could not be sent" / "The money is back in your wallet and goes in next week's payout." | Withdrawal details | Inbox · email | — | **Built** |
| U23 | Add a payout account | Wednesday 09:00 Lagos: wallet balance > 0 and no payout account | "Add a payout account" / "Add one before Thursday 9:00 to be paid this week." | Payout account screen | Inbox | 2 | New |
| U24 | On-demand withdrawal sent or failed | Withdrawal webhook outside a payout run | Same as U21/U22 | Withdrawal details | Inbox · email | 1 | Gap while `PAYOUT_MODE=on_demand`: the webhook only notifies payout-run lines |
| U25 | Reward unlocked | Milestone reached | "Reward unlocked" / "You've earned a new reward for your completed jobs." | Rewards | Push · email | — | **Built** |

### Account

| # | Scenario | Trigger | Push text (draft) | Opens | Inbox · email | Phase | Today |
|---|---|---|---|---|---|---|---|
| U26 | Verified | `applyKycResult` or admin approval (`VERIFICATION_UPDATED`) | "You're verified" / "You can now apply for jobs." | Button **Find jobs** | Inbox · email | 1 | Spec gap |
| U27 | Verification unsuccessful | KYC failure or admin rejection | "Verification unsuccessful" / "Open HireQuick to see your next step." No reason in the push. | Verification screen | Inbox · email | 1 | Spec gap |
| U28 | Set your state | Verified usher with no state, once, 24 h after verification | "Get job alerts" / "Set your state to hear about new jobs near you." | Profile edit | Inbox | 2 | New |

## Client scenarios

| # | Scenario | Trigger | Push text (draft) | Opens | Inbox · email | Phase | Today |
|---|---|---|---|---|---|---|---|
| C1 | New application | `POST /events/:id/apply` | "New application" / "Ada applied to Product launch." Batch to "3 new applications" when several arrive within 10 minutes. | Event screen | Inbox · email | — (batching 3) | **Built**, unbatched |
| C2 | Invitation accepted | Usher accepts an invitation | "Invitation accepted" / "Ada accepted. Pay to confirm the booking." | Button **Review and pay** opens checkout; payment happens in the app | Inbox · email | 1 | Spec gap |
| C3 | Invitation declined | Usher declines | "Invitation declined" / "Ada can't make Product launch." | Event screen | Inbox | 1 | Spec gap |
| C4 | Application withdrawn | `POST /applications/:id/withdraw` | — | — | Inbox only | 3 | New |
| C5 | Payment held in escrow | Charge confirmed | "Payment received" / "Your staff are booked. Funds are held until the work is done." | Funds held screen | Inbox · email | 1 | Inbox row **Built** (written inside the checkout transaction); no push or email yet |
| C6 | Pay to keep your selection | Before a checkout reservation expires | "Payment pending" / "Pay by 14:30 to keep the ushers you selected." | Checkout | Inbox | 3 | New |
| C7 | Event not fully staffed | `reminders` job, start − 48 h with open slots | "2 of 5 places still open" / "Invite more ushers for Product launch." | Event screen | Inbox | 3 | New |
| C8 | Event tomorrow | `reminders` job, start − 24 h | "Tomorrow: Product launch" / "You'll check your 5 staff in with a code on arrival." | Event roster | Inbox | 2 | Spec gap ("attendance pending") |
| C9 | Usher has arrived | `POST /bookings/:id/arrived` | "Ada has arrived" / "Check them in from the roster." | Event roster | Push only, collapsed per event | 1 | New |
| C10 | Usher cancelled | `cancelBookingByUsher` | "An usher cancelled" / "One place for Product launch is open again. Your refund for it is on its way." | Event screen, to invite a replacement | Inbox · email; iOS time-sensitive within 24 h of start | 1 | Spec gap ("cancellation notice") |
| C11 | Usher no-show | `noShowSweep` | "An usher didn't check in" / "You've been refunded in full for that place." | Booking screen | Inbox · email | 1 | New |
| C12 | Confirm the work | Event end time | "Product launch has ended" / "Confirm your staff's work, or report a problem within 72 hours." | Event roster | Inbox | 2 | New |
| C13 | Refund issued | `createRefund`, cancellation refunds | "Refund on its way" / "₦28,750 is being returned to your payment method." | Booking screen | Inbox · email | 1 | New |
| C14 | Dispute opened or resolved | `openDispute`, `resolveDispute` | As U17/U18 | Booking screen | Inbox · email | 1 (resolved) | Opened **Built**; resolved is a spec gap |
| C15 | Rate your staff | `reminders` job, end + 2 h | "How did Product launch go?" / "Rate your staff." | Review screen | Inbox | 2 | Spec gap ("review reminder") |
| C16 | Identity or business verification result | `applyKycResult`, admin business review | "You're verified" / "You can now hire staff." or "Verification unsuccessful" | Verification screen | Inbox · email | 1 | Spec gap |
| C17 | New message | Booking chat message | As U16 | Conversation | Push only | — | **Built** |

Client pushes may name the usher and use the client's own event title: they go to the client's own device. Admins use the web console and its live feed, so they are out of scope.

## What has to be built

### Phase 0: delivery foundation

Nothing reaches a phone until this ships. It needs a new native build; it cannot ship as an over-the-air update.

- **Mobile:** push library and native config, a permission prompt at a sensible moment (after verification, or on first visit to Jobs, with a short explainer), consent grant, device registration, re-registration when the token changes, unregistering on logout, a notification settings screen with the category toggles, and tap and button handling through a role-aware `notificationRoute`.
- **Android channels:** Bookings and payments (high), Event reminders (high), Messages (high), Job alerts (default). People can mute job alerts in Android settings without losing the rest.
- **iOS categories:** `job_alert` (View details, Apply) and `invitation` (View invitation). Time-sensitive interruption for U11 and C10 needs the Time Sensitive Notifications capability.
- **API:** a richer send (type, target, channel, category, collapse key), deleting tokens FCM reports as unregistered, a device delete endpoint, per-category preferences, and a `notification_dispatches` log (user, kind, dedupe key, target, sent, opened, action) for idempotency, caps and tap tracking. The retention purge drops dispatch rows after 90 days; add the table to the [NDPR data register](compliance/ndpr-data-register.md).

### Phase 1: close the lifecycle gaps

U2 copy fix, U3–U5, U11, U13–U15, U18, U24, U26, U27, C2, C3, C9–C11, C13, C14, C16. These are mostly one notify call at an existing state change; U11 needs the `reminders` job.

### Phase 2: scheduled and discovery

U1 job alerts (`jobAlerts` job every 5 minutes), the `reminders` job (U9, U10, U19, C8, C12, C15), U23, U28.

### Phase 3: refinements

C1 batching, U6, U7, C4, C6, C7, and area-level job alerts.

## Job alert matching (U1)

- Match on `state` for v1. Events and ushers already carry it and Discover already filters on it. Events without a state send no alerts; ushers without a state get none until they set one (U28).
- Audience: verified usher, active account, same state, push consent and job alerts on, not unavailable that date, no overlapping booking, not already applied or invited.
- One message per device with bounded concurrency. FCM topics are rejected: an usher who withdraws consent stays subscribed if the unsubscribe fails, which breaks the rule that a withdrawal stops later sends.
- At most five job alerts per usher per day, then one summary ("4 more jobs in Lagos today"). Quiet hours 21:00–07:00 Lagos time, except events starting within 24 hours.
- Later: an area on events from the same picker as `Usher.city`, and ushers choose the areas they will travel to. Confirm with the PRD that showing an area is acceptable while the venue is masked.

## Open decisions

1. **iOS transport.** *Decided 27 October 2026: Expo's push service.* The standard Expo push library returns an APNs token on iOS, which the current FCM sender cannot use.
   - Firebase React Native messaging with Notifee keeps the current sender, schema and processor list, at the cost of more native setup (Firebase config files, the APNs key uploaded to Firebase).
   - Expo's push service needs less app work and supports buttons on both platforms, but replaces the server sender and adds Expo as a processor of tokens and notification text ([privacy and consent](compliance/privacy-and-consent.md) and the data register would change).
2. **Android button reliability.** FCM's standard Android notifications cannot show buttons, so the app renders them from data messages. Tecno and Infinix phones kill background apps aggressively, which makes data messages less reliable. Test on one of these phones before relying on the buttons; tapping the notification body must always work.
3. **Railway configuration.** *Superseded by the Expo decision:* the FCM variables are gone. Set `EXPO_ACCESS_TOKEN` once enhanced push security is on for the Expo project.
