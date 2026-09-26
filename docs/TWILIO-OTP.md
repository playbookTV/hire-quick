# WhatsApp OTP with Twilio

This is the legacy delivery option. A configured KudiSMS key takes precedence
and routes OTP through Nigerian SMS; see [KudiSMS setup](KUDISMS-OTP.md).

HireQuick uses Twilio **Programmable Messaging** to deliver locally generated
login codes. The API retains code hashing, a ten-minute expiry, request limits,
attempt limits and single-use verification. This integration does not require
a Twilio Verify service or a `VA...` SID. Brevo remains the SMS and email provider.

## Account setup

1. Create or upgrade a funded Twilio account.
2. Register a HireQuick WhatsApp sender using Twilio's WhatsApp Self Sign-up.
   An administrator of the Meta Business Portfolio must complete the Meta steps,
   including business verification for production. Use a number you control and
   can verify by SMS or voice. If it already belongs to WhatsApp or another
   provider, follow the applicable migration process before registration.
3. In Twilio Content Template Builder, create an English **Authentication**
   template (`whatsapp/authentication`) with **Copy Code**, a security reminder
   and a ten-minute expiry notice. Submit it for WhatsApp approval. The template
   must be approved before use; an ordinary utility template is not sufficient.
4. Copy its **Content SID** (`HX...`) and the registered sender number.
5. Create a backend API key in the same Twilio account and default US1 region.
   A Standard key works; a Restricted key must permit creating Messages.
   Store its secret when created. The application uses API-key Basic authentication.

Official references: [sender registration](https://www.twilio.com/docs/whatsapp/self-sign-up),
[authentication templates](https://www.twilio.com/docs/content/whatsappauthentication),
[API credentials](https://www.twilio.com/docs/usage/requests-to-twilio).

## Backend configuration

Set these values in the API's secret store (local `.env` for local testing).
Never add them to Expo public variables, source control or chat messages.

| Variable                      | Value                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| `TWILIO_ACCOUNT_SID`          | Account SID beginning `AC`                                   |
| `TWILIO_API_KEY_SID`          | API key SID beginning `SK`                                   |
| `TWILIO_API_KEY_SECRET`       | Secret belonging to that key                                 |
| `TWILIO_WHATSAPP_FROM`        | `whatsapp:+` followed by the registered international number |
| `TWILIO_WHATSAPP_CONTENT_SID` | Approved authentication template's `HX...` SID               |

All five must be present together; malformed or partial settings fail startup.
Leave all five empty to retain SMS-only operation. Keep `BREVO_API_KEY`, the
approved SMS sender and SMS balance configured for fallback and email delivery.
Remove obsolete `BREVO_WHATSAPP_*` deployment variables; they are no longer used.

## Delivery behavior

The API sends the existing six-digit code as `ContentVariables={"1":"..."}`
to Twilio's Messages endpoint. It sends no free-form message body. A failed HTTP
request, timeout, invalid response or immediately rejected message falls back
to Brevo SMS with the same code. A timeout can mean Twilio accepted the request
without returning a response; both channels may deliver that same code.

`sent: true` means provider acceptance, not confirmed delivery. An accepted
message that later becomes undelivered does not trigger SMS automatically.
Delivery callbacks and an explicit user-selected SMS retry are not implemented
by this transport migration. Monitor Twilio delivery logs during rollout.
Recipient numbers, codes, credentials and raw provider errors are never logged
by the application. The in-memory delivery recorder runs only in isolated tests.

## Before enabling for users

The code can be tested without an account; real delivery requires the above
sender and template approvals. Do not treat a WhatsApp Sandbox test as proof of
production authentication-template delivery.

- Use a consenting test recipient with a Nigerian WhatsApp number. Make clear
  that the login code will arrive through WhatsApp, with SMS as a fallback.
- Request a code, confirm its actual arrival and Copy Code behavior, and verify
  that it creates a session. Confirm expired and reused codes are rejected.
- Check Twilio's message status and actual elapsed delivery time. Do not put
  recipient numbers, OTPs, message bodies or credentials in saved evidence.
- In staging, exercise a rejected WhatsApp send and verify the SMS fallback.
  Restore the approved template configuration afterward.
- Confirm sender eligibility, billing, recipient consent and fallback delivery
  before activating the new variables in production.

The migration's unit tests mock provider responses; no real messages are sent.
