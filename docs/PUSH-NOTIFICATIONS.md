# Push notifications

[Documentation index](README.md) · [Scenario map and plan](../documentation/push-notifications-plan-2026-10-27.md)

Push goes through **Expo's push service**, which relays to FCM on Android and APNs on iOS. This guide describes the delivery foundation (Phase 0 of the plan). Which lifecycle events send a push is listed in the plan; only the notifications marked **Built** there send today.

## How a push is sent

1. A lifecycle action calls a `notify*` helper in [`notifications/service.ts`](../apps/api/src/modules/notifications/service.ts). Lifecycle events write an inbox row and send an email when the user has one; chat and rewards are push-only.
2. `deliverPush` locks the user row (`FOR SHARE`) and checks, in order:
   - an explicit `PUSH_NOTIFICATIONS` consent grant (a registered device alone never permits sending);
   - the channel's category switch (`notification_preferences`; no row means everything is on; the `bookings` channel cannot be switched off);
   - at least one registered device.
3. It inserts one `notification_dispatches` row for the user. A send with a `dedupeKey` that already exists is skipped (`ON CONFLICT DO NOTHING`), so retried jobs and scheduled reminders send at most once.
4. [`push.ts`](../apps/api/src/modules/notifications/push.ts) schedules the Expo request without awaiting it: up to 100 messages per request, retried twice on network errors, 429 and 5xx. A withdrawal stops later sends, not one already in flight.
5. Tickets that Expo accepts are stored in `push_tickets`. A ticket error `DeviceNotRegistered` deletes the device straight away.
6. The `pushReceipts` job (every 15 minutes) reads receipts for tickets older than 15 minutes, deletes devices Expo reports as `DeviceNotRegistered`, and drops tickets older than 24 hours, when Expo discards receipts. `InvalidCredentials` and `MismatchSenderId` are reported to Sentry with the fixed code `PUSH_CREDENTIALS`.

Logs and Sentry carry fixed labels, HTTP statuses and Expo error codes only, never tokens or notification text.

## Message contract

Shared in [`packages/shared/src/push.ts`](../packages/shared/src/push.ts).

| Field | Value |
|---|---|
| `title`, `body` | Lock-screen text. Pushes to ushers never contain venues, client-written text such as event titles, identity numbers or verification reasons. The inbox row can keep the fuller text (`PushOptions.body` overrides the push copy). |
| `data` | `{ type, dispatchId, targetType?, targetId? }`. The app routes taps from `targetType`/`targetId`. |
| `channelId` | `bookings`, `reminders`, `messages` or `job_alerts`. Job alerts use normal priority; everything else is high. |
| `categoryId` | `job_alert` (View details, Apply) or `invitation` (View invitation). Buttons only open screens. |
| `collapseId` | Replaces an earlier notification, e.g. `chat:<bookingId>` keeps one notification per conversation. |
| `interruptionLevel` | `time-sensitive` when requested (iOS; the app has the Time Sensitive entitlement). |

## Mobile app

- [`lib/push.ts`](../apps/mobile/lib/push.ts) creates the Android channels and the button categories, asks for permission, records consent, gets the Expo token and registers it. The token is kept in SecureStore so sign-out can unregister it, including after push was turned off.
- [`components/PushBridge.tsx`](../apps/mobile/components/PushBridge.tsx) (mounted in the root layout) runs on phones only: on web it mounts nothing, because expo-notifications' tap hook throws there. It refreshes the inbox when a push arrives in the foreground and opens the screen behind a tapped notification, reporting the open to `POST /api/me/notification-dispatches/:id/opened`. While an account is signed in with push allowed, it keeps the device registered (`keepPushRegistered`):
  - It registers at sign-in and launch, on every token change, and on returning to the foreground until a registration has succeeded. The last case covers push just allowed in the phone's settings.
  - A registration that fails (offline, Expo or the API unreachable) is retried after 5 seconds, then at doubling intervals up to every 2 minutes. Sign-out, turning push off, or the account no longer allowing push stops the retries.
  - Every native token fetch also fires the token listener, so a registration the listener starts links the token it was handed (`getExpoPushTokenAsync({ devicePushToken })`). Fetching again would fire it again, without end. Its retries link the newest token the listener was handed, never an older one. Every other registration fetches a fresh token, since the listener misses changes while it is detached.
  - A tap opens its screen from any screen, modals included, once onboarding has finished. It waits while the user is in sign-in or verification.
- [`components/PushPrompt.tsx`](../apps/mobile/components/PushPrompt.tsx) explains push on the usher and client home screens before the OS prompt. "Not now" hides it for a week. It never shows after the account turned push off or when the phone's settings block it.
- **Notification settings** (Account settings → Notifications) holds the push switch and the category switches. The push switch on Privacy & data uses the same flow.
- Sign-out stops the previous account's pushes reaching a shared phone, even when the API can't be reached:
  - With the session still valid it calls `POST /api/me/devices/unregister` (bounded to three seconds). If that fails, the token rides along on `POST /auth/logout` as a second chance.
  - Whether or not either worked, it unregisters the install from FCM/APNs (`unregisterForNotificationsAsync`) and clears the notification tray and badge. On iOS this step is local; on Android it needs a connection.
  - The app keeps Expo's auto-registration off (`setAutoServerRegistrationEnabledAsync(false)`) and links the token itself, as above. Every Expo token request turns auto-registration on and saves it on the phone. While it is on, every launch links the install's Expo token to a fresh FCM/APNs token, signed in or not, which would undo the unregistration. The app turns it off as each token request finishes, including a request it had stopped waiting for. Sign-out turns it off at once and again around the unregister step, and its cleanup stays pending until it is off.
  - Any signed-out state gets the same local steps, including a session found expired at launch.
  - A failed OS step stays pending and is retried at launch, on returning to the foreground, every minute while the app runs, and always before the next account registers.
  - Registration and cleanup run one at a time, and registration only happens while an account is signed in. Sign-out gives a registration in flight up to three seconds to land, so it removes what that registration added. A registration that lands even later belongs to the signed-out account, so it leaves the sign-out's pending cleanup in place; only one requested after the last sign-out clears it. Every token request, API call and OS call has a time limit, and the Firebase/Apple step runs in the background, so sign-out always finishes within a few seconds.
  - Foreground pushes are hidden while no one is signed in, and the API sends nothing to accounts that are not active.
- One window remains: an Android phone signed out while offline whose app is then closed before it reconnects. Firebase keeps the token valid, so the account's pushes can arrive once the phone is online until the app is next opened.
- [`lib/push-routing.ts`](../apps/mobile/lib/push-routing.ts) holds the pure, unit-tested parts: data parsing, button mapping, role-aware routes, when a tap may navigate, and the prompt rule.

Push needs a physical device and a native build. Simulators, web and Expo Go report it as unavailable.

## Setup

These steps are outside the repository and must be done once per Expo project.

1. **Android (FCM).** In the Firebase project for `com.hirequick.mobile`, download `google-services.json` and add it to EAS as a file environment variable named `GOOGLE_SERVICES_JSON` (or place it at `apps/mobile/google-services.json` for a local build; it is gitignored). [`app.config.js`](../apps/mobile/app.config.js) picks it up. Upload the FCM V1 service-account key with `eas credentials` (Android → Google Service Account → FCM V1). Without the file the build succeeds but Android cannot get a push token.
2. **iOS (APNs).** Let `eas credentials` create or reuse an APNs key for `com.ovalay.hirequick`. The notifications plugin sets the production `aps-environment` entitlement (both EAS profiles use ad hoc or store signing). EAS syncs the push and Time Sensitive Notifications capabilities.
3. **Enhanced security (recommended).** Turn on "Enhanced security for push notifications" for the Expo project and set the resulting access token as `EXPO_ACCESS_TOKEN` on the API and worker. Without it, anyone holding a device's push token can send it notifications through Expo.
4. **New build.** `expo-notifications` is native, so existing installs need a new EAS build; an OTA update cannot add it.

## Rollout order

Migration `20261027120000_expo_push_delivery` renames `device_tokens.fcmToken` to `token` and removes any non-Expo tokens. An API or worker image older than this change reads `fcmToken`, so between `migrate deploy` and the new image, device registration, push sends and the data export fail for that window. Deploy the API and worker immediately after migrating. The mobile app never registered devices before this release, so no live registrations are lost.

## Not covered yet

- Most lifecycle and scheduled notifications (Phases 1–3 of the plan).
- A monochrome Android notification icon; Android currently tints the app icon.
- The published privacy policy does not yet name Expo, Google (FCM) or Apple (APNs) as push processors. Update it, and bump its version, before pushes reach real users.
- Device acceptance: delivery on a physical Android and iOS device has not been verified.
