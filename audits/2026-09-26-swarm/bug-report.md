# Bug Hunter report — mobile checkout recovery and amount handling

**Status:** PARTIAL — no confirmed defect in the tested pure-function scope.
**Declared scope:** current mobile amount parser/formatter, server-backed order summary validation, saved-checkout controller, scoped storage and interruption recovery. Read the surrounding payment-summary/funds-held integration for candidate failure paths. This is an audit, not a production repair.
**Environment:** macOS workspace, Node v26.8.1, pnpm 10.27.0, Vitest 2.1.9; controlled in-memory transports and keychain fixtures. No native device, real database, or provider connection used.
**Version:** started from parent-observed `ca398730a1a52e67b9a448e7af92d39179fd9b7a`; another task changed source and committed during the audit. HEAD at final evidence collection was `f99e3b4e8d9bb7a86f45f04a1430e2ebcb524da1` (2026-09-26 09:34:53 UTC). Exact source fingerprints are in [source-hashes.txt](bug-evidence/source-hashes.txt). Earlier parser implementation observations were superseded by the current implementation.
**Impact under investigation:** a client losing the original checkout/order after interruption, dispatching a duplicate confirmation, displaying an incomplete roster/price, or an usher losing fractional kobo during withdrawal entry. None occurred in the tested fixtures. No evidence of ongoing harm requiring containment.

## Expected versus actual

TRD §10 requires one order for the selected staff, the full sum of their allocations, and entity-scoped idempotency. The documented checkout recovery contract requires saving exact input/key before dispatch, retaining the original order and URL across interruption, explicit terminal acknowledgment, and blocking dispatch when storage is incomplete. Integer-kobo preservation follows the repository money invariant.

All executed cases satisfied those expectations. A passing controlled transport does not establish server, native-storage, browser-return, or device behavior.

## System path

Payment-summary → useConfirmEvent → checkoutStore → createCheckoutController → persisted scoped intent → confirm/resume/status transport → validated response → persisted outcome → UI callback and browser → funds-held → explicit acknowledgment.

Server-order recovery → useOrderSummary → loadOrderSummary → checkout response validation → parallel booking reads → complete roster, order/event identity and amount-sum validation → payment summary.

Withdrawal input → parseNairaInput → integer kobo; prefill/withdraw-all → nairaInput → exact decimal text.

## Reproduction contracts and discriminating tests

Run from the repository root:

```sh
pnpm exec vitest run --config audits/2026-09-26-swarm/bug-evidence/vitest.config.ts
```

The audit config deliberately avoids the API test config that loads the real `.env`. Fixtures exist only in memory and require no external cleanup. Test output is preserved in [test-output.txt](bug-evidence/test-output.txt).

| Hypothesis | Discriminating experiment | Observed result | Status |
|---|---|---|---|
| Amount prefill silently drops fractional kobo | Existing examples plus 10,000 deterministic nonnegative balances within the database integer range; format then parse | Every amount exactly preserved | REJECTED within tested range |
| Ambiguous/unsupported decimal input becomes a valid unintended withdrawal | Existing invalid-input corpus: fractional kobo, negative, exponent, comma grouping, NaN/Infinity, hex, oversized integer | Inputs rejected | REJECTED for corpus |
| Reopening after browser cancellation dispatches a new confirmation | New controller instance over same persisted fixture; resume existing order | Original order/URL and single initial confirmation retained | REJECTED |
| Lost confirmation response rotates the key or input | First transport throws; recreate controller and retry | Original key/input reused | REJECTED |
| Simultaneous actions duplicate dispatch | Hold first transport at a deterministic barrier and submit again | Second action rejected; first confirmation called once | REJECTED within one controller |
| Incomplete storage allows an uncheckpointed payment dispatch | Delete a published chunk before submission | Incomplete-data error; zero confirmation calls | REJECTED |
| A native manifest write that commits then throws destroys recoverability | Publish replacement manifest, then throw acknowledgment error; recreate store | Replacement remains readable | REJECTED |
| Order summary silently tolerates missing staff or mismatched price/identity | Existing tests omit/duplicate bookings, alter amount/order/event and remove a name; also reject one booking read | Summary rejected; no partial result returned | REJECTED |
| Wrong response can replace saved order/reference | Change returned reference on refresh | Response rejected, original receipt preserved | REJECTED |
| A stale UI callback leaves the next scope permanently pending | Source-only review; mounted event/user/order transition not executed | Plausible retained local busy/lock state; runtime reachability not established | ACTIVE research hypothesis |

## Unconfirmed integration hypothesis

`payment-summary.tsx` sets `payLock.current` and `paying` before submission. Its success callback returns when the captured scope fence is stale, before releasing those flags. The scope effect invalidates/activates the fence but does not itself reset the pending flags. If the same mounted component can move to a different event/user/order during the pending request, the next scope may remain locked. Component remounting could eliminate this condition, so this is **Needs Verification**, not a confirmed defect or release blocker.

Exact next experiment: mount the actual screen using the app's real query/mutation integration and controlled transport; begin confirmation for event A; change route parameters to event B without remounting; release A's response; verify whether B permits its own action. Repeat with unmount/remount as a negative control. If reproduced, distinguish stale callback cleanup from resetting a newer in-flight action: a simple unconditional unlock can itself break exclusivity. The parent independently reviewed this candidate and retained it as a hypothesis.

## Verification

49/49 tests passed across five files: 21 amount-input, 10 order-checkout, 13 existing checkout controller/storage, three audit probes, and two monitoring-privacy tests incidentally included by the mobile suite glob. The 10,000-balance probe is one of the three audit tests. These are bounded deterministic fixture results, not production failure-rate estimates. Controlled barriers and fake native calls alter scheduling; real native timing was not measured.

No production correction was made, so failing-before/passing-after proof is not applicable. No speculative patch was introduced. Preserved audit probes supplement the existing invariant tests; they do not claim a regression was fixed.

## Evidence quality and discovery limits

Used Verify-tier graph discovery on project `Users-leslieisah-app-dev-hire-quick`, confirmed ready status, searched helpers and callers, read exact controller/roster snippets, and checked coverage for cited implementation and test paths. Final relevant generation was `2026-09-26T09:32:55Z`; paths reported metadata match and no recorded gap. This is best-effort coverage, not proof of completeness.

The controller graph trace did not resolve callback-based transport calls; source inspection supplied that boundary. Order-summary trace identified both validators and the query/test callers. A broad checkout search returned 50 of 66 results; only the bounded target was pursued, so no repository-wide or exhaustive checkout claim is made.

## Not tested and residual risk

- Mounted React Native navigation, browser return, OS interruption, secure-store availability/limits, physical devices, and cross-process concurrent writers.
- Backend database transactions, provider dispatch, ledger reconciliation, production sessions, network requests or live funds.
- Every possible numeric text shape or JavaScript safe-integer boundary; sampled round trips target database integer balances.
- Corrupt or externally modified server data beyond the explicit validation fixtures.
- Sustained performance or production monitoring. No deployment occurred, so post-release monitoring was not started.

**Confidence:** Confirmed for the recorded test observations. Needs Verification for the retained UI hypothesis. The audit supports the tested helper invariants only; it does not certify the complete payment journey.

Orchestrator closure check: helper/controller/storage/hooks hashes still matched the captured evidence, but `payment-summary.tsx` and `funds-held.tsx` changed after capture. Treat their static observations as snapshot-specific; the mounted-screen hypothesis remains unverified and is not counted as a current confirmed defect.
