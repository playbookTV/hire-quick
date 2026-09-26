# P2 repairs — 26 September 2026

**Status: FIXED AND VERIFIED locally.** Both confirmed findings from the swarm audit are repaired. Deployment and real-database validation were not performed.

## Stale role authority

The HTTP guard now reads the current role alongside account status. A mismatch returns `401 ROLE_CHANGED` before a protected handler executes. Both promotions and downgrades require a fresh token; the guard never upgrades an old token in place. Existing clients refresh once and retry with current authority. An admin action remains forbidden after a downgrade, and a restored admin browser session returns to sign-in if the current role is no longer ADMIN.

Changed production code: `apps/api/src/modules/auth/middleware.ts`. The auth README records immediate invalidation at the next authorization check; requests already executing are not cancelled. Existing inactive-account responses, refresh rotation, logout semantics and legacy token formats remain intact.

The actual middleware and signed JWTs were exercised through a local Express route with isolated persistence. Before repair, three assertions failed (including a downgraded token reaching the mutation handler); afterward all 15 cases passed. The orchestrator independently repeated the 15-case run. Client compatibility tests separately exercise the real admin/mobile clients, verifying one refresh, unchanged request body/idempotency key, lower-authority rejection, and restored-session recovery.

## Stalled sign-in

OTP request and verification now have an eight-second deadline covering transport and response-body reading. Expiry returns `LOGIN_TIMEOUT`, aborts transport and releases the form to retry with its entered values preserved. A transport that ignores abort cannot keep the caller pending or authenticate from a late response. If a late verification returns a token pair, its refresh token is revoked best-effort.

Changed production code: `apps/admin/src/lib/session.ts`. Existing form handling supplies the alert and retry state; no screen restructuring was needed. The regression cases failed before repair and pass afterward, including stalled bodies, ignored cancellation, late responses after retry/logout and timer cleanup.

## Browser retest

The orchestrator recovered browser access after the specialist's initial tooling limitation and repeated the actual UI journey against the local synthetic API at **320×568**:

1. Held the code-request response open. The busy form recovered with “Sending your code took too long. Check your connection and try again.” The screenshot showed the entered email still present and the submit button enabled.
2. Restored the fixture and clicked retry without re-entering the email. The sign-in-code step appeared.
3. Entered the fixture code and held verification open. The form recovered with “Sign-in took too long. Try your code again, or request a new code if it has expired.” The screenshot showed both email and code retained; sign-in, resend and change-email actions were available.
4. Restored the fixture and retried without re-entering the code. The Dashboard rendered successfully.

Requests at `10:59:17.634Z`, `11:00:08.052Z`, `11:00:45.831Z` and the subsequent normal verification are recorded in `ux-evidence/requests.ndjson`. These are controlled failure/recovery observations, not provider delivery or live-account tests. Screenshots were inspected in the tool transcript. The viewport was reset, temporary tab closed, fixture mode restored, and both local processes stopped.

## Checks

| Check | Result |
| --- | --- |
| API middleware and original boundary reproduction | 15 tests passed |
| Admin session/checker, mobile session, role-refresh client compatibility | 56 tests passed |
| API production typecheck | Passed |
| API test typecheck | Passed after correcting a test-only type reference |
| Admin typecheck | Passed |
| All three changed/new canonical test files, dedicated test lint config | Passed |
| Modified production middleware/session lint | Passed |
| Relevant tracked diff whitespace check | Passed |
| Independent Refactor Guardian review | No actionable preservation issues |

**71 tests passed in the final targeted suites.** The earlier audit's 117 tests were a different scope; those counts should not be added as unique tests.

Reproduce the focused checks from the repository root:

```sh
pnpm exec vitest run --config audits/2026-09-26-swarm/p2-vitest.config.mts
pnpm exec vitest run --config audits/2026-09-26-swarm/auth-evidence/vitest.config.mts
pnpm --filter @hq/admin typecheck
pnpm --filter @hq/api typecheck
pnpm --filter @hq/api typecheck:tests
pnpm exec eslint --config eslint.tests.config.mjs apps/api/src/modules/auth/__tests__/role-refresh-client.unit.test.ts apps/api/src/modules/auth/__tests__/middleware.unit.test.ts apps/api/src/modules/auth/__tests__/admin-session.unit.test.ts
```

Both Vitest configurations avoid the API config that loads the real database environment. The middleware suite needs permission to bind a local test HTTP server. No production service, database or identity provider is contacted.

## Limits and follow-through

No schema change, migration, broad refactor, commit or deployment was performed. Other mobile, website and admin-style changes belong to concurrent work and were preserved. Database races, requests already executing during a role change, real provider OTP delivery and native-device journeys remain outside these checks.

After deployment, observe `ROLE_CHANGED` followed by successful refresh or expected access denial, and monitor login timeout frequency. An unexpected refresh loop or increased timeout rate warrants investigation. Reverting the middleware fix restores the stale-role window; reverting the session deadline restores the stalled-form condition.
