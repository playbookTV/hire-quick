import { createHash } from 'node:crypto';
import type { Prisma } from '@hq/database';
import { prisma } from '@hq/database';

/**
 * Append-only, tamper-evident audit log (TRD §14).
 *
 * Each row carries entryHash = sha256(canonical(entry) + prevHash), linking it
 * to the previous entry so any later edit/delete breaks the chain detectably.
 * Writes serialize on the singleton `audit_chain_head` row via SELECT … FOR
 * UPDATE (the same row-lock idiom the money ledger uses) so prevHash is always
 * the true tail. Audit volume is low, so the serialization cost is negligible.
 */

/** Deterministic JSON: object keys sorted recursively, so hashing is stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

interface ChainInput {
  actorId: string | null;
  action: string;
  target: string;
  metadata: unknown;
  prevHash: string | null;
  createdAt: Date;
}

function hashEntry(e: ChainInput): string {
  const canonical = stableStringify({
    actorId: e.actorId,
    action: e.action,
    target: e.target,
    metadata: e.metadata ?? null,
    prevHash: e.prevHash,
    createdAt: e.createdAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function writeAudit(
  entry: {
    actorId: string | null;
    action: string;
    target: string;
    metadata?: Record<string, unknown>;
  },
  transaction?: Prisma.TransactionClient,
): Promise<void> {
  const append = async (tx: Prisma.TransactionClient): Promise<void> => {
    // Ensure the head row exists, then lock it so concurrent writers serialize.
    await tx.$executeRaw`INSERT INTO audit_chain_head (id, "lastHash") VALUES (1, NULL) ON CONFLICT (id) DO NOTHING`;
    const head = await tx.$queryRaw<
      { lastHash: string | null }[]
    >`SELECT "lastHash" FROM audit_chain_head WHERE id = 1 FOR UPDATE`;
    const prevHash = head[0]?.lastHash ?? null;
    const createdAt = new Date();
    const entryHash = hashEntry({
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target,
      metadata: entry.metadata ?? null,
      prevHash,
      createdAt,
    });
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        target: entry.target,
        ...(entry.metadata ? { metadata: entry.metadata as Prisma.InputJsonValue } : {}),
        prevHash,
        entryHash,
        createdAt,
      },
    });
    await tx.$executeRaw`UPDATE audit_chain_head SET "lastHash" = ${entryHash} WHERE id = 1`;
  };
  if (transaction) await append(transaction);
  else await prisma.$transaction(append);
}

export interface AuditChainResult {
  ok: boolean;
  checked: number; // chained rows verified
  legacy: number; // pre-chain rows (no entryHash) skipped
  brokenAt?: { id: string; seq: string; reason: string };
}

/**
 * Verify origin, links, hashes, and the durable head in one database snapshot.
 * The default owns a RepeatableRead transaction. A supplied transaction must
 * already provide a stable snapshot (RepeatableRead/Serializable or equivalent
 * audit-head locking); do not pass an unprotected ReadCommitted transaction.
 * Legacy unchained rows are counted but cannot be cryptographically verified.
 * The same-database head is not an independent anchor against database admins.
 */
export async function verifyAuditChain(
  transaction?: Prisma.TransactionClient,
): Promise<AuditChainResult> {
  const verifySnapshot = async (tx: Prisma.TransactionClient): Promise<AuditChainResult> => {
    const head = await tx.auditChainHead.findUnique({ where: { id: 1 } });
    const rows = await tx.auditLog.findMany({
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        actorId: true,
        action: true,
        target: true,
        metadata: true,
        prevHash: true,
        entryHash: true,
        createdAt: true,
      },
    });
    let prev: string | null = null;
    let started = false;
    let checked = 0;
    let legacy = 0;
    const broken = (reason: string, row?: { id: string; seq: bigint }): AuditChainResult => ({
      ok: false,
      checked,
      legacy,
      brokenAt: { id: row?.id ?? 'audit_chain_head:1', seq: row?.seq.toString() ?? '0', reason },
    });
    for (const row of rows) {
      if (row.entryHash === null) {
        if (started) return broken('unchained row after chain start', row);
        if (row.prevHash !== null) return broken('unchained legacy row has a previous hash', row);
        legacy += 1;
        continue;
      }
      if (!started && row.prevHash !== null) return broken('chain origin is missing', row);
      if (started && row.prevHash !== prev) return broken('prevHash linkage broken', row);
      const expected = hashEntry({
        actorId: row.actorId,
        action: row.action,
        target: row.target,
        metadata: row.metadata ?? null,
        prevHash: row.prevHash,
        createdAt: row.createdAt,
      });
      if (expected !== row.entryHash) return broken('entryHash mismatch (row tampered)', row);
      prev = row.entryHash;
      started = true;
      checked += 1;
    }
    if (started && !head) return broken('durable audit head is missing', rows.at(-1));
    // A non-null anchor with no remaining chained rows is total/tail truncation.
    // An absent/null head with no chained history is a valid fresh/legacy state.
    if ((head?.lastHash ?? null) !== prev)
      return broken('durable audit head does not match chain tail', rows.at(-1));
    return { ok: true, checked, legacy };
  };
  if (transaction) return verifySnapshot(transaction);
  return prisma.$transaction(verifySnapshot, {
    isolationLevel: 'RepeatableRead',
    timeout: 30_000,
    maxWait: 30_000,
  });
}
