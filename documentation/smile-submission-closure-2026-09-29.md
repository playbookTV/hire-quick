# Smile ID submission incident — closed 29 September 2026

**Status: CLOSED — resolved by the provider; successful operation confirmed by the owner.**

## Cause and resolution

Smile ID required provider-side approval of the HireQuick account. The owner confirmed on 29 September 2026 that Smile ID completed that approval and verification now works, then explicitly requested closure of the investigation.

Before approval, the mobile app displayed “Submission Failed” / “Something went wrong. Contact support.” HireQuick recorded capture sessions without provider job IDs or attached verification evidence. The owner also reproduced the failure on Android build 14. The callback base was configured in the running production API and accepted in the Smile dashboard; changing the callback URL was not the resolution reported by the owner.

The cause and successful resolution are based on the owner's confirmation of the provider's action. This closure does not claim a newly observed device test, a particular HTTP rejection code, or independent inspection of Smile's internal approval controls.

## Closure scope

- Close the submission-failure investigation. No further callback troubleshooting is required for this incident.
- Retain the diagnostic improvements already released; no application change, deployment, credential rotation, or verification-record mutation was performed to close the incident.
- Do not infer that the previously missing Sentry event delivery has been independently verified by this confirmation.
- Payment readiness is separate and becomes the next focus; this closure does not change any payment incident or launch gate.

This record supersedes the unresolved submission status in the historical [27 September investigation](smile-submission-diagnosis-2026-09-27.md), [diagnostics release](smile-submission-diagnostics-2026-09-27.md), and [production activation check](production-smile-check-2026-09-27.md). Those dated records remain unchanged as evidence of what was known at the time.
