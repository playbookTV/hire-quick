# KudiSMS live delivery check — 23 October 2026

The [25 September KudiSMS deployment](deployment-kudisms-2026-09-25.md) left two checks open: registering the delivery callback, and a real handset delivery and login. Production API logs (Railway `prolific-love`, environment `production`, `NODE_ENV=production`) now show both.

| Time (UTC) | Event | Result |
| --- | --- | --- |
| 14:35:49 | `POST /auth/otp/request` | 200: KudiSMS accepted the message |
| 14:36:05 | `POST /auth/otp/verify` | 200: the code was entered and the session started 16 s after the request |
| 14:40:02 | `POST /webhooks/kudisms` | 200; logged `SMS delivery report provider="kudisms" status="DELIVRD" code="000"` |

This shows that one Nigerian number received a code from the approved `HIREQUICK` sender and signed in, and that KudiSMS posts delivery reports to the registered callback. The logs do not record the phone number or network. Coverage across MTN, Airtel, Glo and 9mobile, delivery to DND-enabled numbers, and message charges are still unchecked ([live validation steps](../docs/KUDISMS-OTP.md#live-validation-before-rollout)).

Only Nigerian mobile numbers (`+234` followed by 7, 8 or 9) can receive codes in production. Other numbers fail with HTTP 502, because no other provider is tried when KudiSMS is configured. Each number can request at most five codes per hour.
