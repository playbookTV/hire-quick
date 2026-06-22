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

export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Ensure the head row exists, then lock it so concurrent writers serialize.
    await tx.$executeRaw`INSERT INTO audit_chain_head (id, "lastHash") VALUES (1, NULL) ON CONFLICT (id) DO NOTHING`;
    const head = await tx.$queryRaw<{ lastHash: string | null }[]>`SELECT "lastHash" FROM audit_chain_head WHERE id = 1 FOR UPDATE`;
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
  });
}

export interface AuditChainResult {
  ok: boolean;
  checked: number; // chained rows verified
  legacy: number; // pre-chain rows (no entryHash) skipped
  brokenAt?: { id: string; seq: string; reason: string };
}

/**
 * Walk the chain in seq order and recompute every hash. Detects edits (hash
 * mismatch), deletes/reorders (prevHash linkage break), and unchained inserts
 * after the chain started. Rows written before the chain existed (entryHash
 * null) are tolerated only as a contiguous legacy prefix.
 */
export async function verifyAuditChain(): Promise<AuditChainResult> {
  const rows = await prisma.auditLog.findMany({
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

  for (const row of rows) {
    if (row.entryHash === null) {
      if (started) {
        return { ok: false, checked, legacy, brokenAt: { id: row.id, seq: row.seq.toString(), reason: 'unchained row after chain start' } };
      }
      legacy++;
      continue;
    }
    if (started && row.prevHash !== prev) {
      return { ok: false, checked, legacy, brokenAt: { id: row.id, seq: row.seq.toString(), reason: 'prevHash linkage broken' } };
    }
    const expected = hashEntry({
      actorId: row.actorId,
      action: row.action,
      target: row.target,
      metadata: row.metadata ?? null,
      prevHash: row.prevHash,
      createdAt: row.createdAt,
    });
    if (expected !== row.entryHash) {
      return { ok: false, checked, legacy, brokenAt: { id: row.id, seq: row.seq.toString(), reason: 'entryHash mismatch (row tampered)' } };
    }
    prev = row.entryHash;
    started = true;
    checked++;
  }

  return { ok: true, checked, legacy };
}
