# Specifications and evidence

For current setup, development, and operations, use the [implementation documentation](../docs/README.md).

## Canonical specifications

| Document                                               | Purpose                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [Executive Summary](01-HireQuick-Executive-Summary.md) | Product and business overview                                                    |
| [Product Requirements](02-HireQuick-PRD.md)            | Personas, scope, acceptance criteria, cancellation policy                        |
| [User Experience Requirements](03-HireQuick-UXRD.md)   | Client, usher, and operations journeys                                           |
| [Technical Requirements](04-HireQuick-TRD.md)          | Design, financial model, security, release requirements, open provider questions |
| [Cost Model](05-HireQuick-Cost-Model.md)               | Planning assumptions; verify prices before budgeting                             |

Specifications define intended behavior. [Current status](../docs/STATUS.md) distinguishes implemented behavior from unresolved requirements. This index does not mark any compliance or provider gate complete.

## Focused engineering notes

- [Media upload performance and validation](media-upload-performance-2026-09-29.md)
- [OTP verifier storage and key rotation](otp-verifiers.md)
- [Ledger amount limits](ledger-limits.md)
- [Checkout recovery and reservation expiry](checkout-recovery-2026-09-14.md)
- [Payment validation](payment-validation-2026-09-12.md)
- [Approved settlement implementation and validation](payments/settlement-implementation-2026-09-21.md)
- [Weekly usher payouts and configurable platform fee (proposal)](payments/weekly-payouts-proposal-2026-10-23.md) and its [23 October decisions](payments/weekly-payouts-decisions-2026-10-23.md)
- [Push notification scenarios (plan)](push-notifications-plan-2026-10-27.md)
- [Booking and privacy validation](booking-privacy-validation-2026-09-14.md)
- [Checkout, ledger, and realtime validation](checkout-ledger-realtime-validation-2026-09-14.md)

## Incident closure

- [29 September Smile ID submission closure](smile-submission-closure-2026-09-29.md) — provider account approval completed; owner confirms verification works. Investigation closed.

## Current acceptance

- [19 October launch acceptance](launch-acceptance-2026-10-19.md) — device checklist, fresh connectivity checks and outstanding owner evidence.

## Recent deployment

- [23 October production mode switch](deployment-production-mode-2026-10-23.md) — live-key outage, backend switched to `NODE_ENV=production`, staging environment started.

- [2 October marketplace release](deployment-marketplace-2026-10-02.md) — profiles, reporting, search, sharing, decline reasons and hiring improvements.

- [1 October client verification release](deployment-client-verification-2026-10-01.md) - migration, API/worker/admin rollout, internal Android/iOS builds and acceptance evidence.

- [29 September upload performance release](deployment-upload-performance-2026-09-29.md) — API/worker rollout and internal Android/iOS builds.

- [22 September approved settlement deployment](deployment-2026-09-22.md) — API, worker and admin on TEST/staging; final blocked regressions passed. Updated native binaries remain separate.

- [21 September payment recovery deployment](deployment-2026-09-21.md) — API, worker and admin on the existing TEST/staging environment; this deployment predates the new settlement implementation.

## Compliance records

- [Data register](compliance/ndpr-data-register.md)
- [Privacy and consent](compliance/privacy-and-consent.md)
- [SAQ-A record](compliance/SAQ-A.md)
- [Dependency advisories](compliance/dependency-advisories.md)

Other dated files in this directory are historical reviews, task coordination, or test evidence. Their conclusions apply to their stated revision and environment. Preserve their dates, limitations, and provenance. Add new reports for new runs; maintain ongoing instructions in `docs/`.
