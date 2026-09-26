# OVA-166 / OVA-114 closure evidence — 24 September 2026

**Status: in progress; neither issue is certified complete.** This report distinguishes observed Paystack TEST behavior, local regression evidence and account-specific approval. No live financial action, deployment, commit or push is included.

## Account approval (OVA-166)

The existing settlement policy remains approved: event-end + 72-hour dispute hold, 100/50/0 client cancellation refunds, commission within the remaining usher allocation, and no processing-fee deduction from client refunds. No repeat product approval is requested.

Written account-specific acceptance, intended legal entity/integration, manual-payout enablement, holding/transfer limits, recipient requirements, fee/levy terms, approved OTP operating process and named business/finance owners remain outstanding. A [ready-to-send support request](paystack-account-confirmation-request.md) covers them; it has **not** been sent. The hosted checkout displays “Ovalay Academy”, which needs account-owner confirmation for HireQuick.

The [read-only preflight](../validation-evidence/2026-09-24/payments/account-preflight.json) confirms TEST API access, one active NGN TEST recipient and prior transfer success. The opening balance is 2,200,000 kobo. This is an observed baseline, not an explanation or certification of the funds already in the account.

## Actual provider session (OVA-114)

The [resumable runner](provider-session-runbook.md) creates its own private schema, applies tracked migrations and checks drift. It refuses live keys; limits the checkout to 200,000 kobo; binds the refund, withdrawal and sweep to the session's references and exact amounts; reserves each POST before dispatch; and retains all local records while provider outcomes are pending. TEST beneficiary ending 7716 is used for both diagnostic transfer paths, not claimed as HireQuick's approved operating account.

The first initialization used a reserved `.invalid` fixture email and received HTTP 400. Its exact cause was not retained in the response evidence; after changing the fixture to a reserved `example.com` email, the second initialization succeeded. A separate GET confirmed the first reference did not exist, and its schema was removed with absence verified. Do not count the rejected attempt as a payment.

The second session uses schema `hq_validation_cert_da0f42d91c174d589daedb5550956a86`. Its private resumable state is `/private/tmp/hq-114-20260924/session-2.private.json`; never commit that private file. [Sanitized session evidence](../validation-evidence/2026-09-24/payments/provider-session.json) contains observations and ledger totals without credentials, OTPs or full bank details.

| Acceptance step | Observed result |
| --- | --- |
| Actual hosted TEST charge | Paystack page showed TEST and “Payment Successful” for NGN 2,000; independent API verification confirmed success, reference, NGN and 200,000 kobo |
| Charge → HOLD replay | Two booking HOLDs total 200,000 kobo; verified charge recorded twice without duplicate HOLDs |
| Release | Synthetic historical attendance; one RELEASE of 85,000 and FEE of 15,000; wallet credited 85,000 |
| Partial refund | One 100,000-kobo refund POST; provider accepted and deducted TEST balance; local operation remains PENDING awaiting processed evidence; replay used GET-only recovery |
| Withdrawal | One 85,000-kobo transfer POST initially returned OTP; owner-supplied OTP finalized the same transfer; independent provider GET confirmed success; local withdrawal PAID and operation RECORDED; same-key replay did not dispatch again |
| Commission sweep | One 15,000-kobo transfer POST returned OTP; an owner-supplied approval code was rejected with HTTP 400; subsequent GET recovery still found OTP pending; awaiting a fresh code or dashboard approval; no second transfer POST |
| Final reconciliation | Not complete while refund/sweep remain pending. Observed account delta and ledger principal are recorded separately; no balancing entries were invented |
| Actual callback delivery / adversity | Provider-originated signed/delayed/duplicate/out-of-order callbacks, actual reversal, insufficient transfer balance and full account fee/limit behavior are not certified by this polling-based session |

The [withdrawal finalization evidence](../validation-evidence/2026-09-24/payments/withdrawal-finalization.json) excludes the OTP. No OTP-security setting changed. Synthetic fixtures and an isolated service invocation do not validate native UX, real attendance or admission through the deployed API.

The charge verification reported `fees: 3000` kobo, while the [observed TEST balance](../validation-evidence/2026-09-24/payments/charge-ledger.json) rose from 2,200,000 to 2,400,000 kobo before the refund. This is an observation of the TEST account, not proof that live collection fees are waived or that gross collections become immediately transferable. Account-specific fee debits, settlement timing and opening-balance movements still need OVA-166 evidence before live reconciliation can be certified.

## Local checks

- Fresh workspace typecheck and lint passed in the isolated runner.
- Fresh migrations applied with zero drift; both complete InMemory and loopback HTTP lifecycles plus UI recovery passed: **38 tests**. Its disposable schema was removed and absence verified. [Log](../validation-evidence/2026-09-24/payments/local-lifecycle.txt).
- **12 dispatch-guard tests** passed, covering live-key refusal, destination/amount/reference bounds and persisted at-most-once behavior after restart/response loss.
- Validation TypeScript and lint passed. Validation lint now includes executable `.ts` tools as well as tests.
- Broader serial ledger/concurrency/recovery/webhook/adapter regression run: **160 tests passed across 14 files**. Fresh migrations and drift checks passed; disposable schema `hq_validation_20260924174519_0f79a091` was removed with absence verified. [Full log](../validation-evidence/2026-09-24/payments/ledger-regressions.txt).

Total for these distinct checks: **210 passing tests** (160 payment regressions + 38 lifecycle/UI recovery + 12 dispatch guards). These are scoped checks, not a fresh whole-product release certification. Maintained documentation checks also passed (303 local links across 33 documents).

Source hashes are recorded in [the evidence manifest](../validation-evidence/2026-09-24/payments/source-hashes.json). The workspace includes unrelated pre-existing changes; this is not a commit-based release certification.

## Remaining closure requirements

1. Complete the existing sweep approval and retain terminal refund evidence, then record both outcomes locally and verify final reconciliation before normal session cleanup.
2. Obtain actual-provider callback/adverse-state and fee/limit evidence, or explicit owner-approved scope decisions backed by Paystack's documented TEST limitations. Local simulations must not be relabelled actual provider evidence.
3. Obtain the OVA-166 written approval/activation package and named owners. TEST mode does not process settlements ([Paystack environments](https://paystack.com/docs/api/authentication/)); live funding/merchant approval remains separate.
