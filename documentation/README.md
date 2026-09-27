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

- [OTP verifier storage and key rotation](otp-verifiers.md)
- [Ledger amount limits](ledger-limits.md)
- [Checkout recovery and reservation expiry](checkout-recovery-2026-09-14.md)
- [Payment validation](payment-validation-2026-09-12.md)
- [Approved settlement implementation and validation](payments/settlement-implementation-2026-09-21.md)
- [Booking and privacy validation](booking-privacy-validation-2026-09-14.md)
- [Checkout, ledger, and realtime validation](checkout-ledger-realtime-validation-2026-09-14.md)

## Recent deployment

- [22 September approved settlement deployment](deployment-2026-09-22.md) — API, worker and admin on TEST/staging; final blocked regressions passed. Updated native binaries remain separate.

- [21 September payment recovery deployment](deployment-2026-09-21.md) — API, worker and admin on the existing TEST/staging environment; this deployment predates the new settlement implementation.

## Compliance records

- [Data register](compliance/ndpr-data-register.md)
- [Privacy and consent](compliance/privacy-and-consent.md)
- [SAQ-A record](compliance/SAQ-A.md)
- [Dependency advisories](compliance/dependency-advisories.md)

Other dated files in this directory are historical reviews, task coordination, or test evidence. Their conclusions apply to their stated revision and environment. Preserve their dates, limitations, and provenance. Add new reports for new runs; maintain ongoing instructions in `docs/`.
