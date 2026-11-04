# Audit-chain investigation — 29 September 2026

**Status: historical damage confirmed; recovery remains incomplete.** A read-only database check at 01:10 UTC reproduced the `AUDIT_CHAIN_BROKEN` alert against the database host named in the worker's Sentry events. No database records, head pointers, application code, or Sentry issue states were changed.

## Current evidence

The application verifier ran inside a `RepeatableRead` transaction explicitly set to `READ ONLY`. A separate full scan recomputed canonical hashes and checked predecessor links in the same snapshot, because the application verifier stops at the first failure.

- 570 audit records exist. The verifier accepts 19 legacy records and verifies three chained records before failing at sequence 30, dated 21 June 2026.
- 80 records have mismatched entry hashes; 14 records reference absent predecessor hashes. These are link failures, not merely gaps in sequence numbers.
- All 476 records in the preserved September 27 post-protection snapshot remain present and unchanged across every stored field.
- The 94 additional records have no hash mismatches or predecessor-link discontinuities. This establishes an internally consistent extension of the existing damaged history, not full-chain integrity.
- The durable head matches the latest stored entry hash.
- Both preservation triggers remain `ENABLE ALWAYS`; the audit table has no foreign-key constraints.

The sanitized results are in [read-only summary](validation-evidence/2026-09-29/audit-chain/read-only-summary.json). Private historical snapshots remain outside the repository.

## Cause and limits

The first failing record has a null actor reference. Substituting its target as the actor reference in memory reproduces the original stored hash exactly. The original database schema used `ON DELETE SET NULL` for audit actor references, which could mutate hash-covered history when a user was deleted. The June 27 migration removes that mechanism. This establishes a concrete explanation for actor-reference damage; it does not attribute a particular deletion to a caller.

The [September 27 investigation](audit-protection-2026-09-27.md) reconstructed 51 actor references in a private copy by requiring exact matches to original hashes. That reconstruction still had 29 unresolved entry hashes and 14 missing predecessors. Their complete cause and original contents remain unproven. The current comparison shows no further mutation or deletion of the preserved records, or invalid extension, since that snapshot.

The verifier's reason string says `row tampered`, but a hash mismatch alone does not prove malicious activity. The Sentry event is the scheduled verifier reporting failed integrity, not evidence that the job itself crashed. It will continue reporting failure while the historical chain remains damaged.

## Recovery path

Preserve the original records and keep the integrity issue open. The next recovery step is authenticated backup or historical-branch inspection and restoration into separate storage. Recover candidate originals and missing predecessor records there, and compare them with the retained hashes before proposing any historical correction. Do not reset the head, rewrite hashes, or disable verification to clear the alarm.

This investigation did not inspect provider backup availability, perform recovery, or establish independent external checkpoints. Current database triggers prevent ordinary history mutations but do not protect against a database owner changing DDL or rewriting both history and its head.
