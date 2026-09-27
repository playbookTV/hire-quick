# Mobile support via Crisp

The mobile app uses `crisp-sdk-react-native` for its Help & support and contextual
Contact support actions. Operators reply in the Crisp dashboard or operator app.
No HireQuick chat backend or admin inbox is required.

## Configuration

`EXPO_PUBLIC_CRISP_WEBSITE_ID=17beef2c-a56c-41de-8c96-4d7a233389e9`

This public identifier is configured in `apps/mobile/.env` locally and in the
preview/production profiles in `apps/mobile/eas.json`. The iOS archive profile
inherits preview. It is not a Crisp API credential.

Build and install a new native app to include the SDK. An over-the-air JavaScript
update or Expo Go cannot add the native module. In Crisp, disable **Lock the
chatbox to website domain** under Settings → Website Settings → Chatbox & Email
Settings → Chatbox Security, as required by the mobile SDK.

## Behaviour

- Clients and ushers can open Help & support from their profile. Existing booking,
  withdrawal, verification and privacy support buttons use the same inbox.
- On opening chat, the integration shares display name, phone, user ID, role and
  the entry point's support context (including a booking/withdrawal reference when
  provided). It does not send a chat message automatically. These client-supplied
  details help triage; they are not authorization for refunds or account changes.
- Conversation continuity uses a random token stored securely per account and
  workspace on the device. Public user IDs are never conversation access tokens.
  Continuity across devices/reinstallation is not implemented.
- Sign-out/account changes reset the native session. Pending chat launches are
  cancelled when the account changes. A restricted account with no loaded profile
  can open a fresh, unidentified support session.
- If native chat cannot launch, configured WhatsApp/email contacts remain fallback
  options; otherwise an unavailable message is shown.

## Notifications and operations

Background reply push notifications are not enabled yet. They require Firebase
(Android) and APNs (iOS) credentials configured in Crisp, plus the SDK notification
plugin and a new native build. Users can reopen chat to read replies in the meantime.
No notification permission is requested by this integration.

Support conversations are held by Crisp, outside HireQuick's database export and
erasure endpoints. Include Crisp when handling support-data export/deletion requests.

## Validation

The adapter tests cover account switching, logout during startup, missing native
modules, secure-storage failure, repeated taps, context and unidentified access.
Before release, use a native build to open chat as both roles, send a test message
manually, reply from Crisp, reopen chat, then sign out and verify another account
cannot see the first user's conversation. Native presentation and delivery require
that live acceptance check; unit tests alone do not establish them.

Reference: https://docs.crisp.chat/guides/chatbox-sdks/react-native-sdk/
