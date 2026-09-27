# Smile submission failure investigation

**Status: PARTIAL — submission root cause not established.**

The user confirmed Android preview build 13 and supplied Smile's processing screen showing “Submission Failed” / “Something went wrong. Contact support.” No real identity data was submitted by this investigation, and no verification decision or provider setting was changed.

## Confirmed evidence

- Build 13 uses `@smileid/usesmileid` 12.1.0, matching the inspected installed SDK.
- The SDK's `resolveFailureMessage` selects this specific message for network Unauthorized, Forbidden, NotFound, or ResponseParseError. These correspond to HTTP 401/403/404 or an unexpected successful-response format. A screenshot cannot distinguish between them.
- `OrchestratedProcessingScreen` displays the submission failure internally. It calls `navigationManager.exit({kind: 'failed', error: ...})` only on Exit. That exit reaches HireQuick's `onResult`; displaying the failure itself does not invoke it.
- HireQuick's build 13 `onResult` emits only `SMILE_CAPTURE_FAILED` and the attempt reference. It discards the SDK error code and HTTP status. This is a confirmed observability gap, not proof of the submission's cause.
- Direct Sentry project event reads for mobile and API returned no events at inspection time. The Sentry MCP event search could not construct a query; direct API reads were used as a fallback.
- The running API remains deployment `a7a398df-19d8-4c0b-b707-10ba82599313`, with Smile in production mode. A new pending production attempt exists at `2026-09-27T20:32:14.411Z`, without provider status or recorded provider job. The screenshot has not been conclusively correlated to that attempt.
- A production biometric-product token request without identity data returned HTTP 200. Its partner matches the configured backend partner, lifetime is 900 seconds, and policy is 15. This verifies credential/token issuance only; it does not validate submission authentication, device attestation, or product eligibility.
- The signed-in production portal showed a $50 wallet balance, zero Biometric KYC usage for September, and callback allowlisting disabled. No credentials were revealed, replaced, or revoked.

## Hypotheses

- Submission authorization/device-integrity rejection: possible; requires the actual response status and safe diagnostic code. Policy 15 enables all SDK security flags, but that alone does not establish an attestation failure.
- Endpoint rejection: possible from the screen's error mapping, unconfirmed.
- SDK response-schema mismatch after a successful submission: possible from the same mapping, unconfirmed.
- Invalid backend credential: weakened by successful production token issuance.
- Empty Smile wallet: contradicted by the visible account balance.
- Identity rejection or a bad selfie: not established by this screen; it represents failed submission/response handling, not a completed identity decision.

## Required next evidence

Capture the SDK's allowlisted error code and numeric HTTP status at the submission boundary, before the Retry/Exit screen. Retain the attempt reference for correlation. Preserve the original failure/retry behavior; do not transmit raw exceptions, request headers, tokens, response bodies, names, ID numbers, or captured images. A new device reproduction is needed to identify the actual cause; no speculative production fix or security-policy bypass is justified yet.

The follow-up [diagnostics implementation and preview builds](smile-submission-diagnostics-2026-09-27.md) close the HTTP reporting gap. The submission root cause still requires a failure event from the new preview.
