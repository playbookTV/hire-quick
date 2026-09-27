# Booking and privacy batch — 14 September 2026

Root coordinates three workers. Workers report designs, checkpoints and verification evidence; root reviews integration, runs database tests serially in disposable schemas, and updates Linear. Earlier local changes are preserved.

All four tickets are now **In Review**. Final Linear readback confirms **39 remain Todo**, down from 43 at the start of this batch. Local validation passed **176 distinct tests**: 55 pure cases and 121 database cases across the initial and corrective runs. These changes have not been merged or deployed.

| Ticket | Owner | Scope | Status |
| --- | --- | --- | --- |
| OVA-149 | provider_adapter; validation reviewed | Chat media namespace authorization and cleanup checks | In Review |
| OVA-140 | validation; root reviewed | Consistent role/state-aware venue serialization | In Review |
| OVA-148 | withdrawal_flow; provider_adapter reviewed | Eligibility, schedule conflicts and staffing lifecycle | In Review |
| OVA-153 | withdrawal_flow; provider_adapter reviewed | Atomic invitation/application decisions | In Review |

## Reviewed decisions

- Media keys bind a canonical namespace to booking, sender, content kind and object UUID. Upload URLs require current party authorization; stored references and cleanup recheck the binding. This does not certify upload completion, content inspection or durable deletion retries (OVA-174/OVA-146).
- Venue reads reuse the existing paid-booking status allowlist, apply it consistently to invitations and bookings, and preserve owner visibility and route authorization.
- Booking lifecycle changes acquire event, then order, then booking locks. Cross-event scheduling serializes on sorted usher advisory locks; availability writes use the same schedule lock. Root integrates existing payment/admin callers.
- Invitation replies are idempotent. Acceptance may be declined before any live booking; decline withdraws the application in the same transaction. Declined/expired invitations cannot be silently reset by a retry or client selection.
- Future events regain capacity after terminal cancellations/refunds. Started events never reopen recruitment; after the end, completion requires no unresolved bookings. Empty expired events can complete. Existing pending-payment reservations remain occupied until their separate recovery/expiry flow resolves them (OVA-135).
- Independent booking review caught and corrected a PostgreSQL advisory-lock return-type issue, stale/refund-reserved auto-completion candidates blocking unrelated event refresh, and historical future vacancies omitted from the refresh sweep. The corrected sweep rechecks candidates under lifecycle locks and scans events in keyset pages of 100.

## Evidence

Root reran all 55 new pure cases successfully. Initial workspace typechecks/lint passed all 14 forced tasks, and the corrected booking code subsequently passed API/test typechecks and focused lint. Final dedicated root test lint passed.

First DB run: 14 cases passed (10 media, 3 gateway, 1 existing chat); nine venue cases failed because test users defaulted to inactive status. The fixture now explicitly creates ACTIVE users. Isolation, five tracked migrations, drift and schema removal passed in `/private/tmp/hq_validation_20260914161102_2b7ca297.log`.

The final run passed all 107 cases across 14 suites, including corrected venue cases, booking/invitation races, and affected payment, ledger, attendance and admin regressions. Isolation, tracked migrations, drift and cleanup passed in `/private/tmp/hq_validation_20260914161630_4d95b859.log`. Its 107 cases do not overlap the first run's 14 successful media/realtime cases; the nine initial failed venue cases are counted only through their successful corrective rerun. Full evidence is maintained in [the validation report](booking-privacy-validation-2026-09-14.md).

Graph MCP tools are unavailable; verification uses exact source reads/searches and graph generation/index coverage are unknown. No actual provider calls, deployment or financial transfer is part of this batch.
