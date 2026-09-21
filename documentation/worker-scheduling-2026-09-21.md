# Scheduled worker isolation and commission replay — 21 September 2026

Tracks [OVA-160](https://linear.app/ovalaydigital/issue/OVA-160) and the code/test portion of [OVA-97](https://linear.app/ovalaydigital/issue/OVA-97). These are local changes; this pass does not deploy the worker or certify Paystack account behavior.

## Behavior

Each of the eight scheduled workloads has its own `hirequick-jobs-<name>` queue and one processing slot per worker process. A slow commission, storage, or recovery call cannot occupy the reconciliation or attendance queue's slot. This isolates processing capacity; PostgreSQL and Redis remain shared infrastructure.

Schedules explicitly use UTC. Seven workloads have three attempts total, with exponential delays of 30 and 60 seconds. Retention purge retains one attempt until its durable deletion work is finished under OVA-146. Failed jobs retain the latest 100 records per queue. Automatic stalled-job recovery remains BullMQ behavior, so application-level idempotency is still required.

Retries invoke the existing service functions and durable payment operations. They do not replay raw refund or transfer requests. Provider uncertainty remains pending/unknown under the existing payment recovery rules. Commission uses the scheduled occurrence's UTC day (`prevMillis`, with enqueue timestamp fallback for manual/legacy jobs); a retry after midnight cannot create a new day's transfer identity.

Paystack, Dojah and notification transports already have 15-second request deadlines. S3 deletion now has a 15-second total deadline and at most two SDK attempts, safe because deleting the same key is idempotent. A storage timeout rejects; it is not reported as a successful deletion. The existing retention/outbox limitations remain tracked separately in OVA-146.

## Startup, migration and shutdown

- `REDIS_URL` remains required. Readiness and schedule registration must finish within 15 seconds. A bounded Redis readiness check runs before allocating the BullMQ connection pool. Connection errors and startup failures are logged without Redis credentials or provider bodies; startup failure closes resources and returns a nonzero process exit code.
- Stop/drain old worker replicas before the first deployment of this version. Do not roll old and new schedulers together: the old version would recreate the shared-queue schedules.
- Startup registers replacement schedules idempotently, then removes the known repeat definitions from the legacy `hirequick-jobs` queue. Unknown definitions are untouched. A compatibility worker consumes existing queued legacy jobs; it does not erase waiting or active financial work.
- Nine queues/workers (eight workloads plus the legacy consumer) use approximately 27 BullMQ Redis connections per process, plus the realtime emitter. Check the Redis connection allowance and database pool capacity before deployment.
- SIGTERM and SIGINT stop fetching jobs from every queue and await active handlers before releasing the realtime emitter and database client. Configure the deployment's termination grace for the longest batch, not merely one provider request. Provider deadlines bound individual requests; a recovery batch can contain many requests. Forced termination still relies on durable operation recovery at restart.
- Start with `pnpm --filter @hq/api worker:start` after building. Readiness is the `scheduled jobs ready` log. Inspect per-queue failed jobs and `worker connection/runtime error` logs; log shipping/operator alert delivery remains separate launch work.

## Validation

- 104 focused tests passed: real disposable Redis scheduling/isolation/retry/startup/shutdown (including refused and stalled connections); authenticated TLS Redis; Redis URL handling; Paystack contract/deadline behavior; durable operation runner; commission limits; a stalled loopback S3 deletion.
- Runtime tests launch child worker processes and send both SIGTERM and SIGINT during active work, verifying handler completion before dependency disposal and a successful BullMQ job result.
- CI installs Redis so runtime/TLS coverage runs rather than skipping for a missing executable. Tests use disposable loopback servers, not the configured Redis service.
- API production typecheck, test-source typecheck, API lint and targeted test lint passed for this change.
- Database validation is **incomplete**. The broader terminal/recovery run was interrupted after a long period without output. A focused commission replay run then progressed through the concurrent sweeps but exceeded the 120-second test timeout. The new scenario now allows 300 seconds for its serialized remote ledger transactions; this is a test-only limit.
- The next retry applied all seven tracked migrations, then correctly stopped at the drift guard: concurrent payment-recovery work in the shared checkout added `nextAttemptAt`, `quarantinedAt`, `recoveryAttempts` and their index without a tracked migration at that moment. These edits are outside this change and were preserved. The longer-timeout commission test has therefore not yet completed successfully.
- All three disposable schemas were removed, with cleanup verified by the runner. No provider transfers were issued. Rerun the focused database scenario after the concurrent recovery migration is ready. Do not count the interrupted/timed-out runs as passes.

## Remaining release evidence

OVA-97 remains open for the deployed worker's Redis connectivity, configured operating recipient, actual Paystack pending/failed/reversed transfer behavior, account limits and reconciliation evidence (OVA-134/OVA-166). No live or TEST provider transfer was issued by this validation. The broader reconciliation operator workflow (OVA-96) and recovery triage (OVA-151) are unchanged.
