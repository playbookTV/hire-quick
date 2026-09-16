# Audit-chain verification and anchoring

`writeAudit` atomically appends a canonical entry hash and updates singleton `audit_chain_head.lastHash`. `verifyAuditChain()` reads the stored head and ordered entries in one `RepeatableRead` transaction, so a concurrent append cannot produce a false tail mismatch. A caller-supplied transaction must already guarantee a stable snapshot; use RepeatableRead/Serializable or equivalent locking. The verifier performs no database query outside that transaction.

Verification checks the first chained entry's null origin, each predecessor link, canonical entry hashes, and equality between the verified tail and durable head. Removing an initial segment, an internal segment, or the tail is detected while the corresponding other evidence remains. Sequence values need only be ordered, not contiguous: PostgreSQL sequences can have legitimate rollback gaps.

Empty history may have no head or a null head. Legacy rows without entry hashes are counted and accepted only as a prefix with null predecessor hashes; they are **not cryptographically verified**. Any chained history requires a durable head. A non-null head with no chained history fails verification. Clearing or deleting the head while chained records remain also fails.

The database head is durable but **not independent**. It detects accidental or partial deletion and tampering when the head/history is not also rewritten. A database administrator able to replace the rows and the head can rewrite the unkeyed hash chain, or erase both to mimic fresh storage. Legacy history and the absence of an initial anchor cannot prove completeness. This implementation does not claim protection against that threat model.

For independent tamper evidence, operations must periodically retain a checkpoint containing the deployment/database identity, verified terminal sequence/hash, timestamp, and prior checkpoint identity, signed with a key outside the database's administrative boundary and stored in independently controlled append-only/WORM storage. Verification must compare database history with those retained checkpoints and reject rollback or missing ancestry. The destination, key custody, retention, initial baseline, and review cadence require an approved operational design; **external checkpoint storage/signing is not implemented here**.

The maintained integrity tests use an explicit disposable-database guard and rollback-only destructive fixtures, preserving any pre-existing audit chain. Concurrent-append testing retains its valid appended row until disposable-schema cleanup.
