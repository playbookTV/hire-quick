# HireQuick review → Linear reconciliation — 12 September 2026

Reviewed `documentation/codebase-review-2026-09-11.md` against baseline `f36d1c7` and the current uncommitted payment follow-up. No application code was changed during this sync. Graph tools were unavailable; verification used bounded direct source reads.

Created **46 issues** and updated **22 existing issues** in [HireQuick — Launch Readiness (V1)](https://linear.app/ovalaydigital/project/hirequick-launch-readiness-v1-4155f47761e3). All 103 project issues were listed after the changes; new titles/statuses/priorities and the saved update/dependency records were checked.

Detailed security evidence remains in the local review. Automatic approval review rejected exporting the first detailed security payload; concise remediation/acceptance-criteria versions were accepted. No detailed-payload export is pending.

## Numbered findings

| Review finding | Linear | Status / scope |
| --- | --- | --- |
| #1 | [OVA-130](https://linear.app/ovalaydigital/issue/OVA-130/require-authenticated-kyc-callbacks-and-reject-stale-verification) | Todo |
| #2 | [OVA-117](https://linear.app/ovalaydigital/issue/OVA-117/requestwithdrawal-completewithdrawal-against-transfer-api) | Local fix implemented; broader transfer-account validation remains In Progress |
| #3 | [OVA-131](https://linear.app/ovalaydigital/issue/OVA-131/reserve-refundable-bookings-before-dispatching-provider-refunds) | In Review — local changes remain uncommitted |
| #4 | [OVA-132](https://linear.app/ovalaydigital/issue/OVA-132/persist-payment-checkpoints-and-finalize-ledger-effects-atomically) | In Review — local changes remain uncommitted |
| #5 | [OVA-133](https://linear.app/ovalaydigital/issue/OVA-133/commit-withdrawal-and-approval-recovery-intents-with-their-business) | In Review — local changes remain uncommitted |
| #6 | [OVA-134](https://linear.app/ovalaydigital/issue/OVA-134/finish-terminal-refund-and-commission-transfer-reconciliation) | Todo — partially improved; remaining scope documented |
| #7 | [OVA-135](https://linear.app/ovalaydigital/issue/OVA-135/resume-abandoned-checkout-and-expire-unpaid-staffing-reservations) | Todo |
| #8 | [OVA-136](https://linear.app/ovalaydigital/issue/OVA-136/resolve-the-72-hour-dispute-window-versus-early-wallet-release) | Todo |
| #9 | [OVA-137](https://linear.app/ovalaydigital/issue/OVA-137/implement-late-cancellation-split-settlement) | Todo |
| #10 | [OVA-138](https://linear.app/ovalaydigital/issue/OVA-138/consume-refresh-tokens-atomically-under-concurrent-reuse) | Todo |
| #11 | [OVA-139](https://linear.app/ovalaydigital/issue/OVA-139/make-mobile-logout-offline-startup-and-token-refresh-session-safe) | Todo |
| #12 | [OVA-140](https://linear.app/ovalaydigital/issue/OVA-140/mask-precise-venues-in-invitations-and-unpaid-booking-responses) | Todo |
| #13 | [OVA-141](https://linear.app/ovalaydigital/issue/OVA-141/validate-merged-event-edits-under-the-confirmation-lock) | Todo |
| #14 | [OVA-142](https://linear.app/ovalaydigital/issue/OVA-142/align-cancellation-time-boundaries-and-refund-fee-copy-across-clients) | Todo |
| #15 | [OVA-143](https://linear.app/ovalaydigital/issue/OVA-143/return-accurate-withdrawal-outcomes-and-render-matching-receipts) | Todo |
| #16 | [OVA-144](https://linear.app/ovalaydigital/issue/OVA-144/enforce-live-socket-authorization-and-shared-message-validation) | Todo |
| #17 | [OVA-145](https://linear.app/ovalaydigital/issue/OVA-145/verify-audit-chain-origin-and-durable-head-to-detect-truncation) | Todo |
| #18 | [OVA-146](https://linear.app/ovalaydigital/issue/OVA-146/persist-retryable-storage-deletion-intents-and-complete-erasure) | Todo |
| #19 | [OVA-147](https://linear.app/ovalaydigital/issue/OVA-147/bind-idempotency-keys-to-caller-and-request-fingerprint) | Todo |
| #20 | [OVA-148](https://linear.app/ovalaydigital/issue/OVA-148/recheck-booking-eligibility-and-maintain-event-staffing-lifecycle) | Todo |
| #21 | [OVA-100](https://linear.app/ovalaydigital/issue/OVA-100/give-dispute-checkers-decision-evidence-and-reliable-settlement) | Checker context: Todo; admin session renewal also [OVA-163](https://linear.app/ovalaydigital/issue/OVA-163/renew-admin-sessions-and-return-expired-sessions-to-login) |
| #22 | [OVA-149](https://linear.app/ovalaydigital/issue/OVA-149/reject-foreign-chat-media-keys-before-storage-deletion) | Todo |
| #23 | [OVA-150](https://linear.app/ovalaydigital/issue/OVA-150/launch-native-dojah-verification-with-resumable-atomically-counted) | Todo |
| #24 | [OVA-151](https://linear.app/ovalaydigital/issue/OVA-151/finish-fair-payment-recovery-scheduling-and-blocked-operation-triage) | Todo — partially improved; remaining scope documented |
| #25 | [OVA-152](https://linear.app/ovalaydigital/issue/OVA-152/preserve-tls-database-and-encoded-credentials-in-worker-redis) | Todo |
| #26 | [OVA-139](https://linear.app/ovalaydigital/issue/OVA-139/make-mobile-logout-offline-startup-and-token-refresh-session-safe) | Combined with #11; Todo |
| #27 | [OVA-153](https://linear.app/ovalaydigital/issue/OVA-153/make-invitation-decline-and-application-eligibility-consistent) | Todo |
| #28 | [OVA-154](https://linear.app/ovalaydigital/issue/OVA-154/reject-partially-invalid-applicant-batches-before-creating-checkout) | Todo |
| #29 | [OVA-155](https://linear.app/ovalaydigital/issue/OVA-155/preserve-unmentioned-nested-event-preferences-during-patch) | Todo |
| #30 | [OVA-156](https://linear.app/ovalaydigital/issue/OVA-156/preserve-withdrawn-push-consent-during-device-registration) | Todo |
| #31 | [OVA-157](https://linear.app/ovalaydigital/issue/OVA-157/commit-attendance-code-consumption-with-check-in-and-enforce-attempts) | Todo |
| #32 | [OVA-158](https://linear.app/ovalaydigital/issue/OVA-158/refresh-kyc-status-and-recover-missed-provider-results) | Todo |
| #33 | [OVA-159](https://linear.app/ovalaydigital/issue/OVA-159/disable-login-code-echoes-and-unbounded-notification-recording-in) | Todo |
| #34 | [OVA-160](https://linear.app/ovalaydigital/issue/OVA-160/bound-provider-calls-and-isolate-retry-and-drain-scheduled-jobs) | Todo |
| #35 | [OVA-161](https://linear.app/ovalaydigital/issue/OVA-161/typecheck-and-lint-apishared-test-sources-in-ci) | Todo |
| #36 | [OVA-162](https://linear.app/ovalaydigital/issue/OVA-162/preserve-fresh-messages-and-unresolved-dispute-evidence-during) | Todo |

## Additional report work

| Report reference | Linear |
| --- | --- |
| B1 | [OVA-150](https://linear.app/ovalaydigital/issue/OVA-150/launch-native-dojah-verification-with-resumable-atomically-counted) |
| B2 | [OVA-164](https://linear.app/ovalaydigital/issue/OVA-164/connect-mobile-push-and-realtime-with-consent-aware-session-lifecycle) |
| B3 / B9 | [OVA-165](https://linear.app/ovalaydigital/issue/OVA-165/validate-identity-and-notification-providers-and-record-identifier) |
| B4–B6 | [OVA-166](https://linear.app/ovalaydigital/issue/OVA-166/record-paystack-funding-model-refund-fee-and-account-contract) |
| B7 | [OVA-136](https://linear.app/ovalaydigital/issue/OVA-136/resolve-the-72-hour-dispute-window-versus-early-wallet-release), [OVA-137](https://linear.app/ovalaydigital/issue/OVA-137/implement-late-cancellation-split-settlement) |
| B8 | [OVA-167](https://linear.app/ovalaydigital/issue/OVA-167/approve-privacy-notice-retention-rules-and-unresolved-case-holds) |
| B10 | [OVA-168](https://linear.app/ovalaydigital/issue/OVA-168/refresh-dependency-audit-and-remediate-affected-tooling-with) |
| B11 | [OVA-96](https://linear.app/ovalaydigital/issue/OVA-96/reconciliation-alarm-ops-alerting-runbook), [OVA-151](https://linear.app/ovalaydigital/issue/OVA-151/finish-fair-payment-recovery-scheduling-and-blocked-operation-triage) |
| B12 | [OVA-169](https://linear.app/ovalaydigital/issue/OVA-169/reconcile-architecture-and-implementation-documentation-with-current) |
| PP1 / PP11 | [OVA-175](https://linear.app/ovalaydigital/issue/OVA-175/enforce-hold-allocation-conservation-and-accumulated-integer-balance) |
| PP2 / PP6 | [OVA-170](https://linear.app/ovalaydigital/issue/OVA-170/persist-business-notifications-and-audit-delivery-with-retryable), [OVA-146](https://linear.app/ovalaydigital/issue/OVA-146/persist-retryable-storage-deletion-intents-and-complete-erasure) |
| PP3 | [OVA-171](https://linear.app/ovalaydigital/issue/OVA-171/remove-composition-root-error-imports-and-consistently-inject-service) |
| PP4 | [OVA-143](https://linear.app/ovalaydigital/issue/OVA-143/return-accurate-withdrawal-outcomes-and-render-matching-receipts) |
| PP5 | [OVA-114](https://linear.app/ovalaydigital/issue/OVA-114/run-the-full-ledger-suite-against-the-http-adapter) |
| PP7 | [OVA-172](https://linear.app/ovalaydigital/issue/OVA-172/paginate-list-apis-and-synchronize-chat-incrementally) |
| PP8 | [OVA-96](https://linear.app/ovalaydigital/issue/OVA-96/reconciliation-alarm-ops-alerting-runbook) |
| PP9 | [OVA-173](https://linear.app/ovalaydigital/issue/OVA-173/use-keyed-subject-bound-otp-verifiers-instead-of-plain-sha-256) |
| PP10 | [OVA-174](https://linear.app/ovalaydigital/issue/OVA-174/finalize-uploads-with-ownership-content-bounds-and-safe-object) |
| PP12 | [OVA-101](https://linear.app/ovalaydigital/issue/OVA-101/eas-production-build-play-testflight-submission), [OVA-100](https://linear.app/ovalaydigital/issue/OVA-100/give-dispute-checkers-decision-evidence-and-reliable-settlement), [OVA-163](https://linear.app/ovalaydigital/issue/OVA-163/renew-admin-sessions-and-return-expired-sessions-to-login) |
| V1–V7 | [OVA-129](https://linear.app/ovalaydigital/issue/OVA-129/retest-and-sign-off-launch-gate) |

## Existing ticket changes

- [OVA-91](https://linear.app/ovalaydigital/issue/OVA-91/kyc-verification-via-dojah-user-state-retire-escrow-terminology) — Todo: KYC verification via Dojah + user state; retire "escrow" terminology
- [OVA-89](https://linear.app/ovalaydigital/issue/OVA-89/ndpr-consent-management-venue-masking-privacy-policy) — Todo: NDPR: consent management, venue masking, privacy policy
- [OVA-94](https://linear.app/ovalaydigital/issue/OVA-94/paystack-phase-2-http-adapter-against-test-keys) — In Progress: Paystack Phase 2: HTTP adapter against TEST keys
- [OVA-95](https://linear.app/ovalaydigital/issue/OVA-95/withdrawal-bank-transfer-end-to-end-on-paystack) — In Progress: Withdrawal → bank transfer end-to-end on Paystack
- [OVA-96](https://linear.app/ovalaydigital/issue/OVA-96/reconciliation-alarm-ops-alerting-runbook) — Todo: Reconciliation alarm → ops alerting + runbook
- [OVA-97](https://linear.app/ovalaydigital/issue/OVA-97/verify-commission-sweep-scheduling-in-worker) — Todo: Verify commission sweep scheduling in worker
- [OVA-100](https://linear.app/ovalaydigital/issue/OVA-100/give-dispute-checkers-decision-evidence-and-reliable-settlement) — Todo: Give dispute checkers decision evidence and reliable settlement outcomes
- [OVA-101](https://linear.app/ovalaydigital/issue/OVA-101/eas-production-build-play-testflight-submission) — Todo: EAS production build + Play / TestFlight submission
- [OVA-103](https://linear.app/ovalaydigital/issue/OVA-103/external-security-review-pen-test) — Backlog: External security review / pen test
- [OVA-105](https://linear.app/ovalaydigital/issue/OVA-105/load-test-booking-confirm-hold-under-concurrency) — Backlog: Load test: booking confirm + hold under concurrency
- [OVA-113](https://linear.app/ovalaydigital/issue/OVA-113/transfer-transfer-recipient-methods-on-paystackport) — In Review: Transfer + transfer-recipient methods on PaystackPort
- [OVA-114](https://linear.app/ovalaydigital/issue/OVA-114/run-the-full-ledger-suite-against-the-http-adapter) — Todo: Run the full ledger suite against the HTTP adapter
- [OVA-117](https://linear.app/ovalaydigital/issue/OVA-117/requestwithdrawal-completewithdrawal-against-transfer-api) — In Progress: requestWithdrawal → completeWithdrawal against transfer API
- [OVA-118](https://linear.app/ovalaydigital/issue/OVA-118/handle-reversed-failed-transfer-webhooks-with-compensating-entries) — In Review: Handle reversed / failed transfer webhooks with compensating entries
- [OVA-119](https://linear.app/ovalaydigital/issue/OVA-119/extend-withdrawal-transitions-to-cover-every-webhook-state) — Done: Extend WITHDRAWAL_TRANSITIONS to cover every webhook state
- [OVA-120](https://linear.app/ovalaydigital/issue/OVA-120/concurrency-test-double-withdrawal-request-under-for-update) — Done: Concurrency test: double withdrawal request under FOR UPDATE
- [OVA-129](https://linear.app/ovalaydigital/issue/OVA-129/retest-and-sign-off-launch-gate) — Backlog: Retest and sign off launch gate
- [OVA-88](https://linear.app/ovalaydigital/issue/OVA-88/immutable-audit-hash-chain-remove-audit-log-foreign-key) — Done: Immutable audit hash chain: remove audit log foreign key
- [OVA-93](https://linear.app/ovalaydigital/issue/OVA-93/audit-findings-security-reliability-accessibility-visual) — Done: Audit findings: security, reliability, accessibility, visual
- [OVA-77](https://linear.app/ovalaydigital/issue/OVA-77/whatsapp-otp-auth-via-brevo-staging-otp-echo) — Done: WhatsApp OTP auth via Brevo + staging OTP echo
- [OVA-85](https://linear.app/ovalaydigital/issue/OVA-85/in-app-notifications-persistence-deep-linking-discovery-filters) — Done: In-app notifications: persistence + deep linking; discovery filters
- [OVA-80](https://linear.app/ovalaydigital/issue/OVA-80/realtime-notifications-redis-rate-limiting-mobile-discovery-modules) — Done: Realtime notifications, Redis rate limiting, mobile discovery modules

## Validation

- Fresh: 17 operation-runner/HTTP-adapter tests passed across two files.
- Fresh: 32 shared policy/state-machine/DTO/money tests passed across four files.
- The source review records 39 targeted database tests for the payment follow-up. Those database tests were not rerun in this sync.
- Full API/database suite, native-device, provider-account and deployed infrastructure validation remain open in the release gate.
- Existing assignments, deadlines and estimates were preserved; new issues have no invented assignees or due dates.

