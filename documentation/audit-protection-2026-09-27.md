# Audit-history preservation — 27 September 2026

**Status: protection deployed and verified; historical recovery remains open.** The hosted database now rejects ordinary edits, deletions and truncation of audit records. Every one of the 476 records captured before deployment is unchanged afterward.

## Defect and correction

TRD §14 requires append-only audit records. Before this fix, the database accepted ordinary ORM updates/deletes, raw SQL updates/deletes, audit-log truncation, and deletion/truncation of the durable head. Seven regression cases reproduced that gap: every attempted mutation succeeded instead of being rejected. This proves an active storage-control defect; it does not attribute every historical missing record to a particular caller.

Migration `20260927210000_preserve_audit_history` adds statement triggers rejecting `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_logs`, and `DELETE`/`TRUNCATE` on `audit_chain_head`. They remain enabled in replica mode. Normal inserts and the writer's locked head advancement still work. The migration is transactional, with a five-second lock timeout and 30-second statement timeout, and contains no historical data rewrite.

Privileged integrity tests now disable only these named triggers inside the same disposable, rollback-only transaction as their corruption fixtures. Rollback restores both trigger state and records. The compliance suite no longer commits a tampered row before attempting to restore it; its successful append check remains, while the integrity suite retains tamper-detection coverage.

This prevents ordinary data-mutation statements from destroying audit history. Database owners can still alter DDL, and head updates remain necessary for the writer. Restricted runtime database roles and independently retained integrity checkpoints remain separate operational controls; this change does not claim protection against a malicious database administrator.

## Verification

- Before migration: all seven mutation-rejection regressions failed because no rejection occurred. The initial harness had two UUID-binding errors; after correcting those bindings, all seven failures reproduced permitted mutations.
- After migration: all 21 audit/integrity/compliance checks passed, including continued appends after a rejected mutation and corruption detection inside rollback-only fixtures.
- Exact narrow-bundle rehearsal: applied the ten existing deployed migrations, inserted a deliberately damaged historical audit row, then applied only the preservation migration. The row remained byte-for-byte unchanged, both triggers were `ENABLE ALWAYS`, and the unrelated fee migration remained absent. Disposable rehearsal storage was removed.
- Workspace typecheck/lint and test-source typecheck/lint passed. Tracked migrations and Prisma drift checks passed. Trigger behavior is verified by the database tests because Prisma's drift checker does not cover trigger definitions.
- A broader Node 26 run passed 939 API tests and failed one profile-read test with an unexpected HTTP 400; one live R2 test was skipped. The eight profile tests then passed in isolation. Its intermittent cause has not been established; no speculative profile behavior change was made.

The final run on **Node 22.23.3**, matching CI's major version, passed **940 API tests across 102 passing files**, with one live R2 test/file skipped; all **50 local provider-lifecycle checks** also passed. Tracked migrations applied without drift and the runner verified disposable schema cleanup. This was a local run on the CI runtime, not a GitHub Actions execution. See [validation counts and source hashes](validation-evidence/2026-09-27/audit-protection/validation.json) and the [sanitized run summary](validation-evidence/2026-09-27/audit-protection/validation-summary.txt).

## Recovery evidence and limits

A read-only snapshot at 20:56 UTC captured 476 audit records and the durable head into a private local file with mode 0600. A separate private reconstruction restores 51 missing actor references **only where substitution reproduces the original stored SHA-256 exactly**, without changing any other field or stored hash. That reconstruction still contains 29 unresolved entry hashes and 14 missing predecessors. It was not written back to the database.

The private originals and reconstruction are under `/private/tmp/hq-audit-recovery-20260927/`; they contain sensitive historical metadata and must not be committed or attached to Linear. The [sanitized reconstruction summary](validation-evidence/2026-09-27/audit-protection/reconstruction-summary.json) records only aggregate outcomes. These temporary local copies are incident evidence, not a substitute for managed backups.

The database-console session reached a sign-in page, and the local Neon CLI configuration contained no authenticated state. Historical backup inspection therefore requires authenticated console access or a supplied isolated restore. Recover missing records into separate storage and verify against the original hashes before proposing any historical correction. Existing integrity alarms must remain open while full-chain verification fails.

## Narrow deployment procedure

The deployed bundle included only the ten migrations already completed on the hosted database plus this new migration. Each existing migration's checksum was compared with `_prisma_migrations`; the unreleased client-paid-fee migration was excluded. The deployment refused changed migration inventories and used Prisma's normal `migrate deploy` path so the new migration is tracked accurately.

Deployment completed at **21:06 UTC**. Both triggers were read back with their expected definitions and `ALWAYS` setting. All 476 existing records were unchanged; the fee migration remained absent. Three harmless `WHERE FALSE` update/delete statements were rejected with the expected append-only error, proving active statement guards without targeting any existing row. Hosted truncation was not attempted. See [deployment verification](validation-evidence/2026-09-27/audit-protection/deployment.json).

At 21:07 UTC the deployed API returned **200** from both `/health` and `/ready`; see [health verification](validation-evidence/2026-09-27/audit-protection/health.json). The temporary local PostgreSQL server was stopped after disposable-schema cleanup.

There is no application release or fee rollout in this repair. Historical chain recovery, independent anchoring, reconciliation and other launch gates remain separate. OVA-176 should remain open until the historical integrity treatment and operational recovery are complete.

Automatic approval review initially rejected the detailed Linear updates. After explicit user approval, the deployment and validation summaries were posted to OVA-176 and OVA-179 and read back successfully. OVA-176 remains In Progress pending historical recovery; OVA-179 remains In Review pending application-release/CI sign-off. Both still block OVA-129. Private forensic snapshots were not attached.
