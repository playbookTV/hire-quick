# KudiSMS OTP setup

HireQuick sends locally generated login codes through KudiSMS Corporate SMS
when `KUDISMS_API_KEY` is configured. The approved Corporate Sender ID is
`HIREQUICK`. Code hashing, ten-minute expiry, request limits, attempt limits and
single-use verification remain in HireQuick.

## Backend configuration

Set these in the repository-root `.env` for local development and in the API
hosting service's secrets for deployed environments:

```dotenv
KUDISMS_API_KEY="your-private-api-key"
KUDISMS_SENDER_ID="HIREQUICK"
```

Never put the key in mobile/Expo variables, source control, screenshots or chat.
Restart the API after updating secrets. Retain Brevo credentials for email and
other existing notifications; deployed environment validation still requires them.

## Delivery behaviour

- POST JSON to `https://my.kudisms.net/api/corporate` with `token`, `senderID`,
  `recipients` and `message`. The token stays out of URLs and logs.
- Accept Nigerian mobile numbers in `+234...` format and remove the leading `+`
  for KudiSMS. Other countries are unsupported by this adapter.
- Send `Your HireQuick code is 123456. It expires in 10 minutes.` with the actual
  locally generated code. This is a single short GSM-text message.
- Require HTTP success, provider `status: success`, `error_code: 000`, and a
  recipient-matching message reference. Acceptance does not confirm delivery.
- A 15-second timeout, rejection or malformed response returns failure. There
  is no automatic retry or Brevo/Twilio fallback when KudiSMS is configured,
  avoiding duplicate sends and unexpected provider charges.
- Without a KudiSMS key, the existing Twilio-then-Brevo selection remains active.
  Removing the key therefore restores the legacy delivery path.
- `NODE_ENV=test` records delivery intent without making network calls. Explicit
  staging QA identities retain their existing bypass.

The [Corporate SMS API](https://www.kudisms.net/docs/sms/) supports plain OTP
messages. This integration does not use the separate `/otp` endpoint, which
also requires approved app-name and template codes.

## Delivery callback

Register the public API URL with `/webhooks/kudisms` appended. For the current
Railway API hostname, the deployment target is:

```text
https://prolific-love-production-2775.up.railway.app/webhooks/kudisms
```

Deploy the callback route before registering this URL. It accepts POST JSON
delivery reports, acknowledges valid reports with HTTP 200, and records only
the provider, status and code in server logs. Reports are limited to 16 KiB.

KudiSMS's [callback documentation](https://www.kudisms.net/docs/callback/)
documents registration through `POST /api/callback`
with the API key in `token` and the HTTPS callback address in `url`.
The public contract does not specify webhook signatures, so these reports are
explicitly unverified telemetry. They never verify a phone, create a session,
change an OTP, or trigger another SMS. Raw payloads, recipients, free-text
descriptions and customer references are not logged or stored. Duplicate
reports are acknowledged; they can produce duplicate telemetry entries.

After deployment, use a real delivery to confirm the callback payload and
status in server logs. This endpoint does not yet maintain per-message
delivery history or correlate callback references with outbound requests.

## Live validation before rollout

1. Add the key to the backend and fund a small test balance.
2. Request a code through the app with a consenting test recipient. Confirm the
   handset shows `HIREQUICK`, delivery time is acceptable, and the code signs in.
3. Confirm a consumed code cannot sign in again, then exercise resend.
4. Check actual charges and delivery across MTN, Airtel, Glo and 9mobile,
   including a DND-enabled number. API acceptance alone is insufficient evidence.
5. Keep saved results free of API keys, phone numbers and OTPs.

Implementation tests use simulated responses; no live delivery is implied by
passing those tests.
