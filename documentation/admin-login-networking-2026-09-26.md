# Admin email login: outbound IP authorization

## Diagnosis

The deployed API logged `email failed: 401`. A read-only Brevo sender-list request from the running API confirmed that Brevo rejected outbound IP `152.55.185.93` as unauthorized. Admin login reported `OTP_DELIVERY_FAILED` as a result.

## Static IP configuration

Static outbound IPs were enabled for Railway project `HireQuick`, service `prolific-love` (`85b4bcff-3dbc-48a9-882c-17da83ed20ef`), environment `production` (`637575af-e645-4287-a21f-520e7219fb4c`). Railway confirmed the setting was committed and assigned three high-availability addresses:

- `208.77.244.242`
- `152.55.184.240`
- `152.55.185.189`

All three addresses were authorized in Brevo after explicit user approval; the UI confirmed “3 IP addresses authorized.” API deployment `6693f714-0a33-481a-9ad2-ae36f585cf60` then activated the configuration successfully. Static addresses remain stable across deployments in the same region; moving regions changes them.

## Verification

- Railway reports the new deployment as `SUCCESS`.
- The image digest is unchanged from the previous release: `sha256:32a011a756b2616afd7dfc32d557c9f6ed80a2d0d46534cc8910104e9af763a0`.
- Public `/health` and `/ready` both return HTTP 200.
- The read-only Brevo sender-list request executed inside the new deployment returns HTTP 200 and confirms that the configured sender is active. This replaces the previous HTTP 401 unauthorized-IP failure.
- No sign-in email was sent as part of the final check; inbox delivery and completed admin sign-in remain for the user to verify by requesting a fresh code.

No application code, credentials, billing plan, or database records were changed by this networking work. Only the API service was redeployed; the worker's networking configuration was not changed.

References: [Railway static outbound IPs](https://docs.railway.com/networking/static-outbound-ips), [Brevo IP authorization](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security).
