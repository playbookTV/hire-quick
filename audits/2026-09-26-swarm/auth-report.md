# Auth Report — HireQuick session lifecycle and sampled access boundaries

> **Remediation update (2026-09-26):** The user authorized repair after this audit. The HTTP guard now rejects role mismatches with `401 ROLE_CHANGED` before protected handlers run; subsequent refresh obtains the current role. The canonical `middleware.unit.test.ts` exercises signed JWTs through a real local Express route with isolated persistence. Together with the corrected original harness, it produced 3 failing/12 passing tests before the patch and 15/15 passing afterward. See `auth-evidence/repair-before.txt` and `repair-after.txt`. These tests preserve inactive-account, ordinary RBAC, legacy access and logout behavior. The original assessment below is retained as historical evidence; its downgrade-policy uncertainty has been resolved by the explicit immediate-invalidation policy in the auth README. Full deployed/DB-backed integration remains outside this verification.

**Status:** PARTIAL — one confirmed enforcement mismatch; policy decision needed on downgrade propagation.
**Date:** 2026-09-26. **Baseline:** HEAD `ca398730a1a52e67b9a448e7af92d39179fd9b7a`, dirty shared working tree. Examined production auth/admin/booking/socket files had no git changes at evidence capture; concurrent unrelated edits were preserved.
**Declared scope:** HTTP bearer authentication and ADMIN gate; real JWT issuance/verification; live account status and role changes; logout binding; refresh implementation; source review of phone/admin OTP and booking read ownership. Runtime scope is the real middleware/token/socket functions with isolated in-memory persistence, not a deployed API or PostgreSQL integration test.
**Threat model:** anonymous caller, ordinary CLIENT/USHER, current administrator, and a former administrator retaining an unexpired access token. Ownership is user→client/usher→event/booking in the sampled surface; cross-organization tenancy was not assessed. No production identities, secrets, deliveries, or external services were used.

## Authority graph

```text
Phone holder → phone identity → purpose/subject-bound OTP
  → verifyOtp → existing database role / new CLIENT or USHER
  → signed access(role, sub, expiry, optional session id) + refresh(jti, expiry)

Eligible administrator → unique case-insensitive email + ACTIVE ADMIN row
  → admin email OTP → signed access + refresh

Bearer holder → verifyAccessToken → live account status → JWT role
  → requireRole(ADMIN) → admin router → verification/users/ledger operations

Bearer holder → requireAuth → req.auth.userId
  → booking.event.client.userId OR booking.usher.userId
  → booking read / cancellation quote

Socket bearer holder → strict access claims + live ACTIVE status + matching live role
  + unrevoked refresh binding → socket authority

Refresh holder → strict refresh claims → transaction/user lock + ACTIVE status
  → unique denylist insert → pair signed with current database role + audit

Logout refresh holder → verified refresh jti → idempotent denylist insert
  → bound sockets denied; existing HTTP access lasts until expiry/status rejection
```

The role, account status, and ownership checks above are server-side. The sampled HTTP admin boundary does not refresh the role from persistence. Session revocation and live role checks differ between HTTP and sockets. Sensitive admin verification reads and admin mutations have source-visible audit calls; their persistence/atomicity was not runtime tested here.

## Enforcement matrix

| Actor/state | Resource/action | Expected | Observed | Enforcement point | Evidence status |
|---|---|---|---|---|---|
| Anonymous | ADMIN gate | Reject | 401 | requireAuth | Runtime confirmed |
| Invalid bearer | ADMIN gate | Reject | 401 | JWT verification | Runtime confirmed |
| CLIENT token | ADMIN gate | Reject | 403 | requireRole | Runtime confirmed |
| Current ACTIVE ADMIN | ADMIN gate | Allow | Accepted, role ADMIN | requireAuth + requireRole | Runtime confirmed |
| ADMIN token, live role now CLIENT | ADMIN gate | Consistent downgrade semantics; immediate rejection if live role is authoritative | Accepted, stale role ADMIN | HTTP status-only lookup | Runtime confirmed mismatch; policy timing unresolved |
| Same downgraded actor/token | Socket authorization | Reject | Rejected | live role equality | Runtime confirmed |
| Suspended/anonymized/missing account | HTTP and socket authority | Reject | Rejected | live user check | Runtime confirmed |
| Logged-out refresh binding, active account | Existing HTTP access | Valid until expiry under documented policy | Accepted | HTTP token/status check | Runtime confirmed policy behavior |
| Same logged-out binding | Socket authorization | Reject | Rejected | denylist lookup | Runtime confirmed |
| Booking owner versus peer | Booking detail/quote | Owner only | Both party user IDs checked before response | bookings routes | Source reviewed; request matrix NOT TESTED |
| New phone signup requesting ADMIN | Account creation | Disallow ADMIN | Route schema permits CLIENT/USHER only | auth route validation | Source reviewed; NOT runtime tested |
| Refresh reuse | Successor issuance | One successful rotation per token | Unique denylist insert in transaction; P2002 rejected | rotateRefreshToken | Source reviewed; concurrency NOT TESTED |

## Findings

### P2 / Medium · Lifecycle / enforcement mismatch · A downgraded administrator retains HTTP administrator authority until access expiry

- **Boundary crossed:** a token minted for ADMIN continues through the actual HTTP ADMIN middleware after the current user row has role CLIENT. The same token fails socket authorization.
- **Preconditions:** a valid ADMIN access token exists; an operator changes the account role without suspending/deleting the account; token remains unexpired. No self-service or admin role-change route was found in the inspected admin router. An ordinary CLIENT cannot create this state using the tested token controls.
- **Intended policy:** TRD §15 reserves administrator operations to administrators. Socket authorization implements live role matching. The reviewed documents do not specify a role-downgrade propagation SLA; HTTP access lifetime is documented, so an intentional bounded role staleness policy remains possible.
- **Demonstration:** `auth-evidence/lifecycle.test.ts` signs a real session pair using audit-only keys, passes the actual HTTP middleware as ADMIN, changes only the fake persisted role to CLIENT, and observes HTTP acceptance with ADMIN while the real socket authorizer rejects. The fake store honors Prisma `select`, so HTTP receives only status, as it would from its real query. Control cases reject ordinary CLIENT, invalid tokens, suspension, erasure and missing accounts. Six tests passed.
- **Impact:** an operationally downgraded former administrator can still pass the central admin gate and reach its protected handlers for the remainder of the access lifetime (default 900 seconds; deployment value not inspected). This could expose admin data or allow privileged mutations subject to each handler's remaining controls. No real sensitive data or money operation was accessed; downstream financial execution was not demonstrated.
- **Enforcement gap:** `apps/api/src/modules/auth/middleware.ts:27` selects only status; line 32 retains the JWT role. `requireRole` at line 39 consults that role. `apps/api/src/modules/admin/routes.ts:61` mounts those guards. Contrast `apps/api/src/realtime/socket-auth.ts:10`, which rejects a live role mismatch.
- **Fix:** decide and document downgrade semantics. If immediate revocation is intended, select current role alongside status and reject a role mismatch (or consistently use the current role) at canonical HTTP authentication; retain account-status rejection. A small local repair is sufficient; no refactor or schema migration is justified by this evidence.
- **Regression proof:** keep the control cases and change the stale-role characterization to require rejection after correction. Add an actual HTTP admin read test on disposable persistence; independently verify sockets and refresh still use the current role. Characterization currently passes because it deliberately records the defect, not because behavior is repaired.
- **Confidence:** Confirmed implementation mismatch. Product-policy breach timing: Needs Verification. Priority is P2 due to restricted operational precondition and bounded lifetime, despite sensitive possible impact.

## Lifecycle findings

- **Logout/rotation limits are explicit policy, not a newly reported vulnerability.** `apps/api/src/modules/auth/README.md:5` states token-scoped rotation/logout with no family graph, and surviving successor tokens are intentional. Line 7 states existing access remains valid subject to expiry/account status. The harness confirms current HTTP access survives logout while socket authorization rejects the revoked binding. Legacy REST compatibility is also explicit in `tokens.ts:30`.
- **Suspension/erasure controls held in the isolated tests.** ACTIVE is re-read on each HTTP authorization; suspended/anonymized/deleted actors were rejected. This does not establish race-free exclusion for requests already executing during a status change.
- **Refresh issuance uses the current database role.** Source review found user locking, ACTIVE check, unique old-jti consumption, audit and pair issuance within one transaction. PostgreSQL concurrency, rollback, replay, and live revocation races remain untested in this pass.
- **OTP defenses are source-visible.** Phone verification serializes on phone, checks code binding/expiry/attempt count, and consumes within the transaction. Admin email verifies a uniquely matching ACTIVE ADMIN twice around the user lock. This pass did not execute OTP delivery, abuse limits or guessing attacks.

## Machine and federation findings

Paystack/Smile ID webhook identity, background worker authority, service credentials, API keys, and federation were outside this bounded pass. No safety conclusion is made for them. JWT cryptographic signing and verification were exercised with isolated keys, but key storage/rotation and deployment configuration were not assessed.

## Evidence and reproducibility

From repository root:

```sh
node_modules/.bin/vitest run --config audits/2026-09-26-swarm/auth-evidence/vitest.config.mts --reporter verbose
```

Result on 2026-09-26 at 10:34 BST: **1 test file, 6 tests passed**. This custom config does not load the API's dotenv config. The production env module is mocked before import; `@hq/database` resolves to an in-memory fixture that imports no database client. Tests invoke the actual middleware and JWT/socket functions, with only environment, persistence and the error class replaced. They establish function-level enforcement semantics, not end-to-end HTTP integration or PostgreSQL behavior. No production edits were made.

`auth-evidence/source-hashes.json` captures examined source SHA-256 values and UTC capture time. `auth-evidence/coverage.json` preserves the final relevant graph coverage query. The parent orchestrator independently inspected the actual middleware/token source and fixture design, then reran the exact harness at 10:34:41 BST: all six tests passed again (3.73 seconds). This verifies the function-level mismatch; it does not upgrade the evidence to a deployed HTTP or database reproduction.

Graph verification used project `Users-leslieisah-app-dev-hire-quick` in Verify tier. Auth discovery pagination completed all 177 entries. Refresh both-direction depth-1 trace was complete (one caller, three reported callees), with source validating route→rotation→verification/audit. Wide realtime/name scouting was truncated and was not used for exhaustive claims. Exact cited runtime paths had fresh metadata with no recorded issue; auth test helper had a recorded parse gap at line 17, read directly in full. Final extra scope coverage was generation `2026-09-26T09:32:55Z`, and auth scope reported only that helper gap. Coverage is a best-effort signal, never proof of completeness.

## Not tested

Real HTTP routing with auth and persistence together; actual PostgreSQL locks and constraints; deployed CORS/rate limits; password/recovery and account linking; complete admin actor/action matrix; maker-checker; booking mutation ownership and mixed batches; real sockets/rooms and fanout; storage URLs/objects; tenant crossing; jobs/webhooks; production secrets/configuration; device/session UI behavior. No claim of platform-wide security or release certification follows from this audit.

## Release recommendation

**SHIP WITH KNOWN RISKS within this narrow assessed scope**, contingent on acknowledging bounded stale HTTP role authority or applying the local guard correction when immediate downgrade is required. There is no tested new anonymous privilege escalation. This report is insufficient for a whole-product release decision.
