# App-store review login deployment — 23 October 2026

The owner authorized deploying a time-limited app-store review sign-in to the production API so Apple's TestFlight reviewer can sign in without a Nigerian SMS. This record covers the source, the deployment and its checks. The review login stays switched off until the three `APP_REVIEW_*` variables are set.

## Source

Commit `4616a9a` on branch `feat/app-review-login`, one commit on top of `6d6c2ea`. It adds [`app-review.ts`](../apps/api/src/modules/auth/app-review.ts), routes the OTP flow through it and adds three optional settings (see [configuration](../docs/CONFIGURATION.md#app-store-review-login)). The uncommitted weekly-payout work on `feat/weekly-payouts` is not included, and no migration was needed.

Production had been running Railway's stored 2 October upload (`80c2bb0b`), which was never committed. Its [release manifest](validation-evidence/2026-10-02/marketplace-release/release-manifest.json) records a SHA-256 hash for each of its 567 runtime files. All 567 match `6d6c2ea` byte for byte, and `6d6c2ea` has no runtime files the release lacked. So this deployment changes production only by the review login. The production API now runs code that exists in the repository.

## Checks before deployment

- Unit tests: the 32 new review-login tests and the existing staging-QA, OTP-environment, OTP-hash and single-lookup auth suites passed (122 tests). Database-backed auth suites passed on a disposable local `hirequick_test` database (36 tests).
- API typecheck, test typecheck, lint and the docs link check passed.
- Local HTTP check of the built commit in `NODE_ENV=staging` with a live-looking Paystack key, against a disposable database holding an active usher with the review phone:
  - code request returned `{"sent":true}` with no provider call;
  - a wrong code returned 400;
  - the right code returned 200 with a usher session;
  - reusing the code returned 400;
  - the fixed code did not sign in an admin phone;
  - the audit log recorded `auth.login` with `appReview: true`.
- The Railway `staging` environment could not be used. Its API deployment `547bf91d` has been crashing since 23 October 12:20 UTC: the Paystack, Brevo and storage settings it needs were never set.

## Deployment

A clean `git archive` of `4616a9a` (Dockerfiles, `.dockerignore`, `.npmrc`, `apps`, `packages`, `patches` and root workspace files; 571 files, scanned for Paystack keys) was uploaded with `railway up --path-as-root` to service `prolific-love`, environment `production`.

| Item | Value |
| --- | --- |
| Deployment | `792ea349-8457-4779-a218-aefd41d0fd7c` |
| Started / healthy | 21:02 UTC / 21:08:46 UTC |
| Previous deployment | `8ae27728-0901-43a6-9ebb-f6f419c06b34` (2 October upload, now removed) |
| Worker | Unchanged; still the stored 2 October upload |

After deployment, `/health` and `/ready` returned 200 and an unauthenticated `/api/me` returned 401. The API logged `env="production"` at start with no errors. `SENTRY_RELEASE` still reads `hq-sentry-20260928`, so Sentry labels this release with the old name.

## Switching it on

Set on the production API, then redeploy (Railway does this when variables change):

- `APP_REVIEW_PHONE=+2348100000011`: the seeded QA usher A, which must be `ACTIVE` with role `USHER`.
- `APP_REVIEW_OTP_CODE`: six digits known only to the owner. Repeated or sequential digits keep it off.
- `APP_REVIEW_LOGIN_UNTIL`: ISO end time at most 31 days ahead.

If the account is not active, the request falls through to a normal SMS to that number. Sign in once from the TestFlight build with these values before giving them to Apple. Remove the variables after review.

## Rollback

Redeploying the 2 October upload from the Railway dashboard restores the previous code, because the database is unchanged. The worker needs no action.

## Switched on — 23 October 2026, 21:12 UTC

At the owner's request, the three variables were set on `prolific-love` (production). The phone is `+2348100000011` and the end time `2026-11-20T23:59:00Z`. The code was generated locally and piped into Railway; it is not recorded here. Railway redeployed with them (deployment `faa04707-2586-4794-87a7-1b9ec403429d`).

Against production, a code request for the review phone returned 200 `{"sent":true}`. Signing in with the fixed code returned 200 and a session for the existing `USHER` account. A real SMS would have carried a random code, so the review path is confirmed active. That sign-in is in the audit log with `appReview: true`. Delete the three variables after Apple's review.
