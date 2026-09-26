# Refactor Assessment — HireQuick audit remediation

**Verdict:** DO NOT REFACTOR (broad structural work); REPAIR LOCALLY for the demonstrated HTTP stale-role boundary if role changes must revoke prior authority immediately.
**Declared scope:** Checkout controller/recovery boundary, authentication middleware, and the release-booking ledger boundary. This is a necessity assessment, not a full equivalence audit.
**Review:** Independent Refactor Guardian review of the Bug Hunter report, Auth Archon reproduction harness, and actual authentication middleware/token source. Parent supplied checked checkout/ledger source and graph evidence. Snapshot: HEAD `f99e3b4e8d9bb7a86f45f04a1430e2ebcb524da1`, with concurrent mobile edits; this report is not a review of those evolving edits.

## Necessity

No concrete structural change was requested. The task is to investigate with four specialist skills. No measured change-cost, performance or defect-rate baseline establishes that a migration or rewrite would improve this system. Existing local mobile changes were present before the swarm started and are being changed/staged by another actor; they are not swarm repairs.

The checkout controller already isolates persistence and transport through injected interfaces. Authentication has a shared middleware boundary. The ledger centralizes wallet/escrow mutation and release checks. These are useful places for narrowly scoped regression tests and corrections when a defect is proven. Their existence is not proof that their implementations are correct.

The Bug Hunter's 49 passing fixture tests establish no need to restructure checkout. The Auth Archon fixture establishes a narrower concrete behavior: after a controlled account role changes from ADMIN to CLIENT, the real HTTP `requireAuth` and `requireRole` middleware still accept the previously signed ADMIN token; the socket authorizer denies it. The harness calls middleware directly with an in-memory database adapter, not an HTTP server or deployed database. The parent independently reran all six auth cases. No self-service downgrade route or production exploit was demonstrated. The configured access-token lifetime defaults to 900 seconds, but the required role-change propagation window remains unspecified. This is a lifecycle policy/enforcement issue, not evidence for replacing the authentication architecture.

| Option | Benefit and cost | Decision |
| --- | --- | --- |
| Do nothing structurally | Preserves current contracts; leaves confirmed defects for explicit repair | Default |
| Local repair | Restores a demonstrated invariant with a bounded patch and reproduction | Preferred for confirmed findings |
| Incremental refactor | Adds migration and equivalence work; no measured need established | Not justified yet |
| Migration | Changes compatibility assumptions without a required platform/schema transition | Not justified |
| Rewrite | Largest regression surface; no evidence that local repair is insufficient | Not justified |

## Invariants any later correction must preserve

| Invariant | Evidence/baseline | At-risk surfaces | Required proof |
| --- | --- | --- | --- |
| One saved checkout intent per caller/event, persisted before dispatch; uncertain acceptance retains identity | `apps/mobile/lib/checkout.ts:35` and checkout recovery design | Payment summary, saved recovery, transport | Controlled lost-response/retry, interruption and scope-change reproduction |
| Recovered server order retains its identity, roster and integer amount | `apps/mobile/lib/order-checkout.ts:5` | Server-backed recovery UI | Wrong-order, incomplete-roster and amount-mismatch rejection |
| Inactive accounts cannot use previously minted access tokens | `apps/api/src/modules/auth/middleware.ts:17` | Authenticated HTTP routes | Real middleware with active/inactive fixture transitions |
| A role change must respect the explicitly chosen authority propagation policy | `auth-evidence/lifecycle.test.ts`; current HTTP middleware reads live status but retains token role | Every HTTP consumer of `req.auth.role`, plus socket consistency | Same signed token before/after controlled role downgrade; active unchanged-role controls; promotion and subsequent refreshed-token controls |
| A stale token must not silently gain newly granted privileges | Signed token role is currently used by HTTP | Role promotion and privileged routes | Prior CLIENT token after live promotion must not become an ADMIN token simply because middleware replaces its role |
| Release is no earlier than event end + 72 hours and cannot bypass unresolved disputes | `apps/api/src/modules/payments/ledger/ledger.ts:336`; approved settlement policy | Completion, jobs, dispute resolution, wallet | Boundary-time and transaction/concurrency tests on disposable storage |
| Integer kobo conserved; ledgers append only; bank withdrawal separate from wallet release | Approved settlement policy and repository instructions | Ledger and provider recovery | Conservation, idempotency and provider-uncertainty tests |

## Blast radius and evidence limits

Graph project: `Users-leslieisah-app-dev-hire-quick`, Verify tier, parent-supplied latest coverage generation `2026-09-26T09:35:06Z`. Exact checkout, order-helper, middleware, token and ledger paths had fresh metadata with no recorded indexing gap. This is a best-effort signal only. The independent reviewer used the supplied graph evidence and read the exact auth implementation and harness; it did not claim a new graph audit.

Complete depth-one inbound/outbound `releaseBooking` trace identifies booking completion/auto-completion, admin dispute resolution and a provider validation script as callers. Its exact source invokes locking, refund-reservation checks, allocation checks, ledger writes, milestones and staffing refresh. Moving this function therefore touches financial and operational contracts beyond its immediate file.

The checkout trace identifies the store module but does not capture the complete closure/callback flow. Direct source inspection supplements it. The auth trace includes a spurious mobile `next` edge; it is rejected as impact evidence. Neither trace supports an exhaustive dependency claim.

## Smallest auth correction and compatibility proof

Classification: **incremental repair with an intentional lifecycle behavior change**, not a behavior-preserving refactor. If immediate role invalidation is the chosen contract, extend the existing account lookup to select `role` along with `status`, then reject a token/live-role mismatch before attaching `req.auth`. Keep the existing status check and the unchanged-role path. Requiring a fresh token avoids turning a prior low-privilege token into a privileged one after promotion. Simply overwriting the token role with the database role would change both downgrade and promotion behavior and is a larger policy choice.

This correction belongs in the existing middleware and requires neither schema migration nor a new identity service. Its blast radius is all authenticated HTTP requests from an account whose role changed while its token remains valid. Return a stable error through the existing envelope and verify that mobile/admin clients can refresh or sign in again rather than loop on an unrecognized denial. The exact error code and recovery interaction are part of the repair contract and were not implemented or tested in this assessment.

Before accepting the repair:

1. Preserve the observed stale-role reproduction, then add a policy assertion that fails on current code and passes only when the downgraded token is denied. Do not mistake the present observation test, which expects acceptance, for a regression test of corrected policy.
2. Verify unchanged ADMIN and CLIENT sessions, anonymous/malformed tokens, inactive/missing accounts, and fresh correctly issued tokens retain their expected behavior.
3. Verify a prior CLIENT token after promotion remains insufficient until a fresh token is obtained, and repeat both HTTP and socket checks.
4. Exercise the real client recovery path and one representative protected HTTP route; the isolated middleware fixture alone does not prove either integration.

Existing token format, legacy REST token acceptance, refresh rotation, and logout semantics need not change for this repair. The observed survival of REST access after refresh-token revocation is a separate policy question; requiring socket-style `sid` binding everywhere would introduce a compatibility change and is not justified by the stale-role repair alone. The existing database lookup means selecting the additional role need not add a round trip, but no latency measurement was performed. Reverting a repair diff is mechanically simple but restores the stale-role window; that is not a security-neutral rollback.

## Migration and cleanup gate

Necessity gate failed for broad structural work. No migration plan, structural edits, schema changes or deletion of existing paths is warranted by this evidence. No paths should be deleted. A proposed local repair should carry its exact failing reproduction, protected invariant, rollback diff and adjacent checks. Escalate back to this assessment only if a proven repair cannot fit the existing boundaries.

## Residual risk

No production code is modified by this assessment. The source tree is changing concurrently, so specialist evidence must identify its tested snapshot. Live provider behavior, database concurrency, native-device behavior and deployment equivalence are not certified.

**Confidence:** High Confidence that broad refactoring is not presently justified; correctness findings are evaluated separately in the specialist reports.
