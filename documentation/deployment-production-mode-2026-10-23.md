# Production mode switch — 23 October 2026

The owner switched the Railway API to live Paystack keys on 19 October and then authorized running the backend in production mode. This record covers the resulting outage, the configuration changes and their verification. No application code changed.

## Outage — 19 to 23 October

At 16:34 UTC on 19 October the API's Paystack secret key was replaced with a live key. `STAGING_QA_OTP_CODE` was still set, so environment validation refused to start the API: `QA login requires staging and Paystack test keys`. Railway restarted it 11 times in nine seconds, then left deployment `350550d6` crashed. The API was unavailable until 11:45 UTC on 23 October. The worker and admin kept running, but the worker still used the Paystack TEST key.

## Configuration changes (Railway environment `production`)

| Service | Change |
| --- | --- |
| API (`prolific-love`) | `NODE_ENV=production`; `STAGING_QA_OTP_CODE` removed; `PAYSTACK_WEBHOOK_SECRET` now references `${{PAYSTACK_SECRET_KEY}}`. Its previous value was a URL, which would have rejected every Paystack webhook. |
| Worker (`hirequick-worker`) | `NODE_ENV=production`; `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` now reference `${{prolific-love.PAYSTACK_SECRET_KEY}}`, so both services always use the same live key. |

Unchanged: Smile ID was already `SMILE_ENVIRONMENT=production`. CORS, proxy hops, Redis and the Neon database are as before. `PAYSTACK_OPERATING_RECIPIENT` is unset on both services, so the commission sweep skips itself.

Both services were redeployed from Railway's stored 2 October upload: API deployment `8ae27728-0901-43a6-9ebb-f6f419c06b34` and worker deployment `4d8127b0-7827-460d-8ce7-6d0633ee8166`. The 2 October release revision (`80c2bb0b`) was never committed to this repository, and its local snapshot no longer exists. It can only be redeployed from Railway, not rebuilt from source.

## Verification

- `/health` and `/ready` returned 200. An unauthenticated `/api/me` returned 401. A Paystack webhook with an invalid signature returned 401.
- The admin console returned 200, and the API's CORS preflight allowed the admin origin.
- The API logged `env="production"` at start. The worker's `autocomplete`, `smileMonitoring`, `checkouts`, `noshow`, `storageCleanup` and `resumeOps` jobs all completed with `outcome="ok"` in production mode.

Not verified: a live charge, a signed live webhook delivery, a refund or a withdrawal. The owner must set the webhook URL `https://prolific-love-production-2775.up.railway.app/webhooks/paystack` in Paystack's **Live** settings.

## Side effects

- Sentry and the observability dashboard now label events `production` instead of `staging`. Update any saved Sentry filters or alerts that select `staging`.
- The realtime authorization cache moved to a new Redis key prefix and was rebuilt on demand.
- QA login is off. The seeded QA identities remain in the database but cannot sign in with the shared code.

## Outstanding before real payouts

- The production database still holds TEST-mode ledger entries and wallet balances. These must be cleared with new ledger entries before any withdrawal or commission sweep runs.
- Saved usher bank accounts hold TEST-mode Paystack recipient codes. Live transfers to them will fail until the accounts are added again.
- A separate Railway environment named `staging` was created with its own Postgres service. Its API, worker, admin and Redis are not deployed yet.
