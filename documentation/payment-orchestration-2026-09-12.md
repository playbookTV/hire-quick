# Payment ticket orchestration — 12 September 2026

Scope: finish implementation and verify the three In Progress tickets OVA-94,
OVA-95 and OVA-117. Existing uncommitted payment work at HEAD `f36d1c7` was
preserved and extended. This document records the orchestration; measured test
results and provider limits are in `payment-validation-2026-09-12.md`.

Final local validation: **241 unique passing tests** (207 API across the full
run and corrective reruns, 32 shared, two local provider lifecycle cases), one
pre-existing storage integration skip, and no unresolved test failures.
Workspace typecheck/lint, selected strict test checks, migration/drift checks
and disposable-schema cleanup also passed. This is not one clean full-suite
invocation and does not certify actual provider settlement.

Seven Linear tickets were updated and read back successfully. OVA-94, OVA-95
and OVA-117 remain In Progress because provider acceptance and review/merge are
incomplete. OVA-143 is In Review; OVA-134 is In Progress for remaining provider
validation. OVA-147 and OVA-114 retain Todo with completed partial work recorded.

## Team and acceptance process

| Role | Ownership | Reporting |
| --- | --- | --- |
| Root orchestrator | Integration, terminal webhooks, sweep reversal, code review, final Linear status | Receives designs and milestones; accepts only evidenced results |
| Provider adapter worker | HTTP port and adapter tests | Checked validation/deadline design with root; reported test and actual TEST-account results |
| Withdrawal worker | Caller-bound idempotency, API/shared response, mobile receipt and retry storage | Checked contract and persistence design with root; reported regression/static results |
| Validation worker | Disposable database runner, lifecycle harness, validation evidence | Obtained root approval for isolated schema work; owns all database suite execution |

Codebase graph tools were unavailable. Verification used direct source reads
and searches; graph generation and index coverage are unknown.

## Implemented behavior

- HTTP provider responses validate amounts, NGN currency and references. Every
  port method has contract coverage; bank and refund pagination and request
  deadlines are bounded. Unrecognized read evidence cannot authorize a transfer
  or refund reissue.
- New charge references use the provider-supported `hq-<order-id>` form; retries
  preserve existing stored references.
- Withdrawal idempotency binds caller, operation and request payload. Legacy
  replay checks ownership before repair or dispatch. Concurrent first requests
  serialize before lookup.
- Withdrawal responses contain persisted status, amount, bank ID and current
  wallet balance. Mobile renders pending, failed and completed receipts and
  retains unresolved keys/payloads in per-user SecureStore before sending.
  Confirmed receipts remain saved until explicit user acknowledgment; overlapping
  acknowledgment and submission cannot delete a newer intent.
- Transfer callbacks lock the durable operation and commit its terminal status
  with the ledger result. A returned completed commission transfer appends one
  positive COMMISSION_SWEEP; the signed aggregate remains reconcilable.
- Refund callbacks trigger read-only reconciliation of already dispatched
  intents. They cannot consume a new intent's first dispatch. Valid string
  refund amounts are normalized; malformed signed event envelopes are rejected.

## Review corrections required by the orchestrator

1. Unknown transfer/refund read statuses must throw, not masquerade as absence.
2. A retry rejection is not proof that an earlier uncertain request failed;
   retain its checkpoint until a matching validated outcome is obtained.
3. Retain mobile checkpoints across route closure and process restart.
4. Refund callback amounts may be integer strings according to the provider
   contract; validation must accept them safely.
5. A callback for one booking must not claim attempt one of another booking's
   refund against the same charge.
6. Strict-check new test sources as well as production TypeScript; fix concrete
   mock return types instead of hiding them with permissive casts.
7. Post-dispatch response-contract failures return 500, never a pre-acceptance
   validation error. Persist the resolved receipt before showing it and remove
   it only after user acknowledgment.

The complete API run also exposed stale test assumptions. Booking callbacks now
read the initialized charge reference; the full-refund fixture explicitly places
its event more than 48 hours ahead. Auth/rewards/remediation cleanup retains
append-only audit rows instead of punching holes in the shared hash chain, and
the intentional tampering test restores its row in a finally block. These are
fixture corrections, with no cancellation-policy or audit-production change.

## Validation boundaries

Local dual-port lifecycle tests use a deterministic HTTP server for HttpPaystack
and real PostgreSQL transactions. They are not Paystack settlement certification.
The remote validation database uses a fresh schema and the direct endpoint;
eight simultaneous connections must prove identical ORM/raw-SQL routing before
migrations or fixtures run. Only the generated schema is removed afterward.

Actual TEST-account reads and a synthetic checkout initialization passed. Hosted
checkout interaction was blocked because Browser reported no available browser.
The user has been asked to complete that own TEST checkout. Actual provider
settlement, native device interaction, and deployment must be evidenced
separately. No live payment credentials or live money are used by validation.

The separately prepared actual TEST withdrawal probe was blocked before
execution by automatic approval review: the transfer POST is considered an
external financial side effect requiring explicit user authorization. No
transfer was attempted. Database-only checks continue independently; the
prepared probe must not be executed through another tool to bypass this block.

## Remaining scope boundaries

Actual TEST-account read evidence is retained in
`/private/tmp/hq-provider-validation-evidence.json`: valid NGN balance response,
284 banks over five pages, and HTTP 404/not_found for a nonexistent transfer.
Synthetic checkout initialization returned HTTP 200 for reference
`hq-validation-1eb340c9-1488-44f5-a42b-125453051a91`. A subsequent authoritative
read confirmed TEST domain, 10,000 kobo, NGN, and `abandoned` status: no completed
charge was evidenced. These checks do not certify recipient creation, transfers,
refunds or settlement.

- OVA-147's booking callers remain outside the withdrawal binding change.
- OVA-151's operator queue, retry policy and broad recovery triage remain a
  separate task; existing recovery uses the durable payment protocol.
- OVA-166's provider funding, fee and account-contract decisions are not answered
  by a successful TEST API call.
- Work remains in the local working tree pending review/merge; ticket statuses
  must distinguish this from merged or deployed behavior.
