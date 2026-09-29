# Verification attempt cooldown — 2026-09-28

**Status:** Fixed and verified locally; not deployed by this change.

## Cause and correction

The reported `KYC_ATTEMPTS_EXCEEDED` message came from counting every historical Smile biometric session. Five sessions permanently prevented new starts, including when captures had been abandoned. Account-specific production history was not inspected.

The backend now permits five new Smile sessions in a rolling 24-hour window. Each attempt stops counting exactly 24 hours after its creation. The error keeps its existing code and HTTP 429 status, and explains the remaining wait in hours/minutes, rounded up to the next minute. The existing mobile error handler displays that message.

The time and session query run after acquiring the usher row lock. Concurrent starts therefore share one budget, including at the expiry boundary. Blocked requests create no session and cannot extend the wait. Eligible session refreshes still work at the limit. Verification history, lifetime counters, provider-result checks, and the prohibition on restarting an already verified identity remain intact. No migration or scheduled reset is required.

The 24-hour duration is the implementation default; the user requested automatic cooldown recovery without specifying a duration. See the maintained [Smile ID guide](../docs/SMILE-ID.md).

## Verification

- Before the correction: 20 tests passed and the two new expiry/message regressions failed against the original service.
- After the correction: all 22 tests in `apps/api/src/modules/verification/__tests__/verification.test.ts` passed against real PostgreSQL with a fake Smile provider.
- Coverage includes exact expiry, rejection one millisecond before expiry, retained history, further starts after recovery, concurrent requests competing for one recovered slot, and session refresh during cooldown.
- Workspace typecheck and lint passed; lint reported existing warnings in environment validation and the native Sentry plugin. API typecheck/lint were rerun after the service change. Test-source typecheck/lint, documentation link checks, and diff whitespace checks passed.
- Both runs used the isolated validation runner, deployed tracked migrations without drift, and verified removal of their disposable schemas. Run IDs: `hq_validation_20260928083845_643b2532` (before), `hq_validation_20260928084301_e997eb80` (after).

## Release and limitations

Deploy the API to activate the policy for existing accounts. No mobile binary update is required. A physical-device acceptance check and this specific account's recovery remain unverified. After release, verify a capped account receives a remaining-wait message and can start when its oldest counted session expires. Reverting the service restores the historical lifetime limit without a data rollback.
