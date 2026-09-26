# Current behavior and known boundaries

[Documentation index](README.md) · [Specifications](../documentation/README.md)

Reviewed from source on **2026-09-16**, with approved settlement implementation updated **2026-09-21**. This is a bounded documentation reconciliation, not an exhaustive defect audit or a production certification. Dated validation reports remain evidence for their own revision/environment.

## Implemented foundations

The repository includes OTP authentication and refresh revocation, recruitment/eligibility checks, durable checkout recovery, append-only escrow/wallet accounting, provider-operation recovery, scheduled jobs, private media and realtime authorization, KYC flows, admin approvals, consent/erasure/export, and reward milestones. Existence in source does not establish that each external service is configured or that every platform workflow has passed release acceptance.

## Material limitations and differences from older documentation

| Area                      | Current boundary                                                                                                       | Implication / evidence                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Late client cancellation | Approved 100%/50%/0% refund and commission-inclusive usher allocation implemented locally | Immutable quotes, guarded approvals, append-only settlement; [Payments](PAYMENTS.md#policy-matrix) |
| Admin partial refunds     | Current refund execution requires the full eligible booking amount                                                     | `REFUND_MUST_BE_FULL`; [admin service](../apps/api/src/modules/admin/service.ts)                                                           |
| Dispute window | COMPLETED remains HELD until event end + 72h; PAID/historical released funds remain protected from clawback | Shared deadline and locked release/freeze gates; [state tables](../packages/shared/src/state-machines.ts) |
| Processing-fee deductions | Disabled and not wired into ledger settlement                                                                          | Owner approved no client refund deduction; effective global flag is false; [policy source](../packages/shared/src/policy.ts)                           |
| Checkout expiry           | Thirty-minute deadline alone does not prove nonpayment                                                                 | Uncertain outcomes remain REVIEW; [checkout source](../apps/api/src/modules/payments/checkout.ts)                                          |
| Refund ambiguity          | After possible dispatch, recovery reads evidence and does not blindly issue another refund                             | Some outcomes require operator/provider investigation; [Payments](PAYMENTS.md)                                                             |
| OTP development login     | Direct code echo is test-only                                                                                          | Configure delivery for interactive development; [OTP service](../apps/api/src/modules/auth/otp.ts)                                         |
| Refresh recovery          | One successor per consumed token; no session-family revocation or replay of lost successor                             | Lost committed response requires login; [auth policy](../apps/api/src/modules/auth/README.md)                                              |
| Realtime transport        | Guarded Redis application envelopes; best effort, no durable signal replay                                             | API/worker protocol versions must match; [realtime note](../apps/api/src/realtime/README.md)                                               |
| Mobile live updates       | Current mobile package has no Socket.IO client dependency; relevant hooks poll                                         | Backend event support is not native live-delivery evidence; [hooks](../apps/mobile/lib/hooks.ts)                                           |
| Shared policy in admin    | Admin does not currently declare `@hq/shared`                                                                          | Older claims that every app imports identical matrices were too broad; [manifest](../apps/admin/package.json)                              |
| BVN gate                  | Optional withdrawal gate is disabled by default                                                                        | Enabling it is not implementation of a complete live BVN matching service; [environment schema](../apps/api/src/env.ts)                    |
| Storage deletion          | Erasure and retention use best-effort object deletion                                                                  | Tombstoned DB references do not establish successful physical deletion; [jobs](../apps/api/src/modules/jobs/jobs.ts)                       |
| Operational readiness     | Health endpoint only reports liveness; source includes logs/signals but does not provision backup/alert infrastructure | Verify deployment, paging, restore drills, provider settings separately                                                                    |
| Seed                      | Fixture phones, fixed historical event date, repeated event creation                                                   | Not a repeatable production onboarding or login workflow; [setup](GETTING_STARTED.md)                                                      |

## Release questions remain explicit

The [TRD](../documentation/04-HireQuick-TRD.md) §23 records merchant-of-record, held-balance, wallet, provider fee, and verification questions. This documentation update does not resolve those questions or establish legal/provider approval for live funds. Product/payment owners must record their decisions and update the affected specification and implementation together.

For each deferred capability, track a concrete implementation/decision, acceptance criteria, and current evidence in the team's issue system. Close a gap here only after its behavior and verification actually change. Do not replace a limitation with an old test report or a future-tense claim in an architecture page.

The OVA-136/137 API, worker and admin changes were [deployed to TEST/staging on 22 September](../documentation/deployment-2026-09-22.md), after the outstanding regressions passed. Updated native binaries remain separate. The earlier 21 September deployment record is historical. See [settlement implementation and validation](../documentation/payments/settlement-implementation-2026-09-21.md). OVA-166 account authorization remains a live-rollout gate.
