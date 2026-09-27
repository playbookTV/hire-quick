# Shared account, communication and recovery flows

Source audit of the current application at commit `8fa28a4`, 18 September 2026. These are source-verified behaviors; mobile device execution is still required. Requirement references are to the repository’s PRD/UXRD/TRD, not independent legal conclusions.

## Flow coverage

| Journey | Existing implementation | Missing or incomplete step |
|---|---|---|
| New account | Welcome → role → phone → OTP → profile | Restart-safe profile completion; visible policy acknowledgement |
| Returning account | Phone → OTP → role home; persisted session and refresh | Inactive-account explanation; explicit lost-phone/support path |
| OTP recovery | Resend, change number by back navigation, inline errors | Delivery-channel clarity and actionable lockout guidance |
| Client account management | Identity, support link, sign out | Edit profile; settings/notification rows are inert |
| Privacy/data controls | Backend export, erase, consent and policy APIs | Entire mobile control surface and acknowledgement flow |
| Notification delivery | Persisted inbox, polling; configured backend FCM transport | Mobile permission/consent/token registration and push-open handling |
| Lifecycle notifications | Invitations, applications, bookings, payouts, disputes, checkout | Several promised events/reminders and useful destinations |
| Coordination | Booking chat, text, polling, retry failed send | Images/voice, read state, retained-history entry after cancellation/refund |
| Session recovery | Loading/error/retry/sign-out; generation-fenced sessions | Distinguish suspension from network failure |

## Findings

### SHR-01 · P2 · Onboarding does not have a durable completion checkpoint

OTP explicitly opens `complete-profile`, whose local checks require a client name or usher bio. But a cold start goes through [index.tsx:10](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/index.tsx:10), which routes solely by authentication and role. Both role layouts also guard only auth/role. Closing the app after OTP saves the session but before finishing the profile can therefore skip that step on restart. The profile completion check exists only within [complete-profile.tsx:40](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(auth)/complete-profile.tsx:40).

**Add:** a shared, role-specific onboarding checkpoint at entry and relevant guarded routes. Resume the first incomplete step; allow deliberately optional work to be skipped explicitly. Do not duplicate the whole onboarding stack.

**Acceptance:** terminate after successful OTP and before profile save; restart returns to profile completion for both roles. Terminate after profile completion or verification submission; restart resumes the appropriate next state without overwriting saved fields. Complete users go directly home.

### SHR-02 · P2 · Client account editing ends at a placeholder

[ClientProfile](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(client)/profile.tsx:1) renders `ProfileView`. Its Account settings and Notifications rows have chevrons but no handlers ([ProfileView.tsx:64](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/ProfileView.tsx:64)); the helper intentionally returns a non-interactive view when `onPress` is absent. The backend accepts client display/business-name changes ([profile/routes.ts:134](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/profile/routes.ts:134)). The existing edit-profile modal is usher-specific.

**Add:** client profile editing and a shared account-settings destination; wire Notifications to the inbox or a clearly named preferences screen. Preserve the existing working support action.

**Acceptance:** change client name/business → save → profile and counterpart context reflect it after refresh; validation/network error preserves input; both settings rows open a useful destination. Clarify that changing account role requires support rather than offering an unsupported role switch.

### SHR-03 · P1 · Privacy and data-control APIs have no mobile journey

The complete mobile route inventory contains no policy, consent, export or erase view. Searches of app/components/lib find no calls to `/api/legal/privacy-policy`, its `/accept` action, `/api/me/consents`, `/export` or `/erase`. Those endpoints exist in [legal/routes.ts:18](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/legal/routes.ts:18) and [privacy/routes.ts:28](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/privacy/routes.ts:28). The published product policy itself says users can export/erase in-app and change notification/marketing consent ([policy.ts:40](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/legal/policy.ts:40)). Neither account-creation screen displays that policy or invokes its acknowledgement API.

**Add:** shared Privacy & data settings, a readable policy accessible before sign-in, deliberate version acknowledgement, consent preferences, export delivery/status, and an erasure confirmation/outcome that explains retained records. Review the server’s financial-obligation behavior before exposing erasure; a button alone is not an end-to-end deletion flow. No legal-compliance certification is implied here.

**Acceptance:** read policy before creating an account; record the version actually presented; toggle each supported consent independently; export can be retrieved; erasure handles active obligations and interrupted responses deliberately; completed erasure clears local credentials and cached personal data.

### SHR-04 · P1 · Users cannot enable the notification delivery the product depends on

Mobile has no notification SDK dependency, permission request, consent mutation or device registration call in the reviewed source. Backend device registration exists ([profile/routes.ts:308](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/profile/routes.ts:308)), and delivery requires explicit PUSH_NOTIFICATIONS consent ([notifications/service.ts:25](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/service.ts:25)). Configured FCM delivery is implemented in [brevo.ts:198](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/brevo.ts:198); calling it a stub would be inaccurate. The missing device-side steps still prevent a normal mobile install from participating. Polling the inbox only helps while the app is active.

Email is not a dependable alternate onboarding path: lifecycle delivery reads `user.email`, but profile editing accepts no email field ([profile/routes.ts:35](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/profile/routes.ts:35)). The phone-only sign-up does not collect one. Checkout billing email is a separate concept and must not silently be treated as verified account contact/marketing consent.

**Add:** contextual notification opt-in, explicit consent, OS permission, token registration/refresh, denial recovery and push-open routing. The FCM transport currently sends title/body only; typed target data must also be supplied by the backend. If email is the intended fallback, add verified account contact collection and preference handling.

**Acceptance:** new device permits/denies notifications; token registers only under the intended consent contract; background invitation arrives on a real device; tapping after termination opens the correct authorized record; revoking consent stops subsequent sends; denial does not block core booking work.

### SHR-05 · P1/P2 · The lifecycle notification catalogue is only partly connected

The notification service implements persisted invitation received, application received, booking confirmed, payout released and dispute opened notifications. Checkout writes its own status notices. The bounded service/callsite and jobs-source review did not find persisted catalogue equivalents for shortlist, invitation response, verification decision, cancellation, dispute resolution, attendance reminders or review reminders. A realtime emit to an open socket is not a durable inbox event or background push. The mobile app currently polls and has no Socket.IO client.

This contradicts specific promises: event success says matching ushers are being notified ([event-success.tsx:43](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/event-success.tsx:43)); verification waiting says approval will trigger a notification ([awaiting-approval.tsx:156](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(verification)/awaiting-approval.tsx:156)). PRD §10 and UXRD §10 list the broader catalogue.

**Priority:** verification, cancellation and dispute outcomes are P1; shortlist/review reminders are P2.

**Add:** an explicit event-to-recipient/channel/destination table and durable lifecycle delivery, with deduplication and retries. Correct promises where a particular delivery is intentionally deferred. Do not imply that every missing catalogue entry needs its own screen.

**Acceptance:** exercise every agreed lifecycle event while the recipient app is closed; verify one durable notification per logical transition, correct audience, correct destination and useful fallback after the target changes state. Check verification approval/rejection and cancellation first.

### SHR-06 · P2 · Notification taps commonly have no destination

[notifications.tsx:82](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/notifications.tsx:82) marks a notification read and only navigates checkout/invitation/event targets. It has no booking/dispute/wallet branch. Although service functions optionally accept booking IDs, the actual booking-confirmation call omits one ([checkout.ts:26](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/payments/checkout.ts:26)), as does the dispute-open call ([bookings/service.ts:381](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/bookings/service.ts:381)). Payout notifications also lack a wallet/activity target. These rows look actionable but can only clear their unread state. The inbox reads the latest 50 without pagination ([notifications/routes.ts:27](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/notifications/routes.ts:27)), so it cannot double as a durable case-history navigator.

**Add:** typed, role-aware destinations using stable IDs, with authorized/missing/expired-target fallbacks. Connect them to the proposed booking and case detail screens. Keep case history independently discoverable.

**Acceptance:** each supported notification opens the exact relevant record, including from cold start; marking read cannot silently replace navigation; unavailable records explain why and provide a safe return; older actionable cases remain reachable elsewhere.

### SHR-07 · P2 · Chat supports only part of the promised coordination flow

The composer and `useSendMessage` accept only text; message rendering prints `m.content` without a content-type branch ([message-thread.tsx:239](/Users/leslieisah/app-dev/hire-quick/apps/mobile/app/(modals)/message-thread.tsx:239), [hooks.ts:163](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/hooks.ts:163)). The backend supports typed media and authenticated media ownership ([realtime/messages.ts:83](/Users/leslieisah/app-dev/hire-quick/apps/api/src/realtime/messages.ts:83)). Images and voice are explicit PRD §8 (Communicate) / UXRD §6.8 requirements. The app also does not call the implemented mark-seen/unread capability or show message unread state in its conversation list.

There is a concrete trust-copy mismatch: a flagged message displays “Contact details are hidden” while rendering the unredacted text above it. The server intentionally flags without blocking/redacting. The notice should describe what actually happened.

**Add:** authorized image and voice attachment/send/render/retry flows in the existing thread, read state and unread counts; honest non-blocking contact-safety copy. Resolve permission denial, interrupted upload and expired media access before presenting attachments as complete.

**Acceptance:** send/receive each supported content type; reopen a thread with new inbound content; verify unread clearing; retry media without losing draft; unauthorized media stays inaccessible; flagged text is paired with truthful wording.

### SHR-08 · P2 · Cancellation and refund hide retained coordination history

[ConversationList.tsx:21](/Users/leslieisah/app-dev/hire-quick/apps/mobile/components/ConversationList.tsx:21) filters to CONFIRMED/CHECKED_IN/COMPLETED/PAID/DISPUTED. A cancelled, refunded or no-show booking therefore disappears from Messages. Backend [listMessages](/Users/leslieisah/app-dev/hire-quick/apps/api/src/realtime/messages.ts:126) permits either participant to read retained history irrespective of those statuses. Losing the entry point when a booking goes wrong undermines the dispute/support evidence journey. A direct stale thread still renders an enabled composer even when the server rejects new sends for that booking state.

**Add:** an archived/read-only conversation section or retained chat link from booking history; derive compose availability from booking status and explain why it is disabled. Retention expiry should have its own clear state.

**Acceptance:** confirmed booking with messages → cancel/refund/no-show → both parties can find retained history; disallowed sends are visibly unavailable; disputes keep permitted coordination; expired/redacted history is explained rather than presented as no messages ever.

### SHR-09 · P2 · Suspended accounts are treated as a connectivity problem

The API returns `403 ACCOUNT_INACTIVE` for an inactive account ([auth/middleware.ts:29](/Users/leslieisah/app-dev/hire-quick/apps/api/src/modules/auth/middleware.ts:29)). Mobile refresh logic distinguishes 401, not 403, and session restore catches every failure into `problem: 'restore'` ([auth-session.ts:63](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/auth-session.ts:63)). The rendered recovery screen says “Check your connection and try again” ([auth-context.tsx:45](/Users/leslieisah/app-dev/hire-quick/apps/mobile/lib/auth-context.tsx:45)). A fresh OTP sign-in receives an inline inactive-account error without a support route. Repeated network retries cannot resolve a suspension.

**Add:** explicit access-restricted state with safe support entry and sign-out, preserving the distinction between suspension, erasure, expired authentication and unavailable service. Do not disclose sensitive enforcement details or promise reinstatement.

**Acceptance:** suspend a disposable fixture account while signed in → reopen → correct restricted state; support is reachable without protected API access; offline restore still offers retry; normal token expiry follows the existing sign-in flow.

## Scope decisions, not automatic additions

- PRD §7.2 describes password recovery, but the implemented authentication is deliberately phone OTP. Decide whether OTP-only is the launch contract before inventing password screens. Lost-phone/account-access support still needs a defined process.
- Phone entry says “We’ll text” while the backend can prefer WhatsApp. Return/display the actual delivery channel and useful resend/lockout guidance; this is an existing-screen improvement.
- Moving usher Calendar off the bottom bar to make room for Messages is an implemented IA choice with Home/Profile entry points, not a missing Calendar flow.
- No mobile live-pass claim is made. Native permission prompts, process termination, keyboard behavior, camera/voice attachments, background delivery and real provider outcomes remain acceptance work.

## Evidence limits

Graph generation `2026-09-18T18:23:11Z`, full mode. Complete File enumeration returned 169 mobile/admin source/config paths. Exact cited paths and mobile app/lib/components, privacy, notifications, legal/jobs scopes were checked for coverage; no relevant recorded gap except the separately reviewed dispute modal line 68. Notification call chains were traced in both directions and confirmed against source. File enumeration and literal search are not proofs of dynamic runtime reachability; route actions and wrappers were manually checked. The route inventory explicitly flags this limitation.
