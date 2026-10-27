# Current behavior and known boundaries

[Documentation index](README.md) · [Specifications](../documentation/README.md)

Reviewed from source on **2026-09-16**, with approved settlement implementation updated **2026-09-21**. This is a bounded documentation reconciliation, not an exhaustive defect audit or a production certification. Dated validation reports remain evidence for their own revision/environment.

## Implemented foundations

The repository includes OTP authentication and refresh revocation, recruitment/eligibility checks, durable checkout recovery, append-only escrow/wallet accounting, provider-operation recovery, scheduled jobs, private media and realtime authorization, KYC flows, admin approvals, consent/erasure/export, and reward milestones. Existence in source does not establish that each external service is configured or that every platform workflow has passed release acceptance.

## Material limitations and differences from older documentation

The Smile ID submission incident is **closed as of 29 September 2026**. The owner confirmed successful verification after Smile ID approved the account. See the [closure record](../documentation/smile-submission-closure-2026-09-29.md). This provider resolution does not close payment readiness gates.

**Client verification extension (1 October 2026, deployed):** mandatory personal identity for all clients; business clients additionally require registry and representative-authority review. The migration, API, worker and admin rollout succeeded, and signed Android/iOS preview builds are available. Authenticated checks verified the client hiring gate and verification/booking-list access. The owner confirmed KYB activation and explicitly waived the backup step. Physical-device client capture and a real production business review remain unverified. Existing mobile installs must update. See the [release record](../documentation/deployment-client-verification-2026-10-01.md) and [Smile ID](SMILE-ID.md#mandatory-clients-and-business-verification).

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

## Marketplace gap closure (2 October 2026, deployed)

Application withdrawal, preserved multi-worker invitation selection, optional physical attributes and explained event preferences, decline reasons, pre-booking reports with admin review, job search/native app sharing, and rich client/company profiles are implemented. The category control blocks new/edited preferences; it does not retroactively modify listings. Reports are deduplicated for the reporter/target's lifetime. Public profiles omit private contact email and phone. Shared jobs use the existing installed-app scheme, without a hosted web fallback. See [API](API.md#marketplace-profiles-and-hiring-2-october-2026) and [workflows](WORKFLOWS.md#extended-hiring-and-marketplace-profiles). The database migration, API, worker and admin were deployed on 2 October; Android preview 24 and iOS preview 14 were built from the frozen release source. Installed-device acceptance remains outstanding. See the [release record](../documentation/deployment-marketplace-2026-10-02.md).

[Marketplace implementation and validation evidence](../documentation/marketplace-gap-closure-2026-10-02.md) records the tested scope, sample screenshots, native-device limitations and migration rollout order.

## Weekly payout runs (23 October 2026, not deployed)

Phase 1 of the [weekly payout decisions](../documentation/payments/weekly-payouts-decisions-2026-10-23.md) is implemented: payout runs with two-admin approval, per-line transfer OTP entry, a payout account per usher, payout notifications and the `PAYOUT_MODE` withdrawal gate in the API and worker; the admin console Weekly payouts page (`/payouts`); and the mobile wallet's next-payout card, payout-account screen and payout labels. See [Payments](PAYMENTS.md#weekly-payout-runs). The mobile changes need a new EAS build. Not in this change: the configurable platform fee (the rate stays 15%) and phase 2 automatic execution with the Paystack transfer approval URL. Live use also waits on clearing pre-launch TEST balances and recipient codes, and on confirming the live account settles to balance.

## Launch acceptance follow-up (19 October 2026)

Public API health and readiness both returned HTTP 200. Expo lists the 2 October Android/iOS preview builds as FINISHED. This does not establish device acceptance or current deployed-source parity. OVA-166 and OVA-114 remain In Progress in Linear. The [acceptance checklist](../documentation/launch-acceptance-2026-10-19.md) separates observed checks from pending device, provider and recovery evidence.
