/**
 * Idempotency guard (TRD §10/§25). Wraps a money operation so a retried request
 * or replayed webhook produces exactly one effect. The key insert and the work
 * share one transaction, so a failure rolls back both (the key won't block a
 * legitimate retry). Scopes per §10: order_id | booking_id | withdrawal_id |
 * paystack_event_id.
 */
import { Prisma, type PrismaClient } from '@hq/database';
import { createHash } from 'node:crypto';
import { ApiError } from '../../../app.js';

export interface IdempotentResult<T> {
  duplicate: boolean;
  result: T | null;
}

export interface IdempotencyBinding<T> {
  callerId: string;
  /** Canonical representation of all effect-changing request fields. */
  requestFingerprint: string;
  /** Return false for foreign legacy results; throw on an owner's changed request. */
  legacyReplay?: (tx: Prisma.TransactionClient, result: T | null) => Promise<boolean>;
}

export function idempotencyStorageKey(key: string, scope: string, callerId?: string): string {
  return callerId === undefined
    ? `${scope}:${key}`
    : `bound:v1:${createHash('sha256').update(JSON.stringify([scope, callerId, key])).digest('hex')}`;
}

export async function runIdempotent<T>(
  prisma: PrismaClient,
  key: string,
  scope: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  binding?: IdempotencyBinding<T>,
): Promise<IdempotentResult<T>> {
  // Namespace by scope so the same caller-supplied key in two scopes (e.g. a
  // withdrawal key vs a paystack_event_id key) can never collide. §10 scopes:
  // order_id | booking_id | withdrawal_id | paystack_event_id.
  const legacyKey = idempotencyStorageKey(key, scope);
  const scopedKey = idempotencyStorageKey(key, scope, binding?.callerId);
  return prisma.$transaction(async (tx) => {
    // Lock before the read: simultaneous first requests must replay, not race on
    // the unique insert. Include the legacy namespace during gradual migration.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${legacyKey}, 0))::text`;
    const existing = await tx.idempotencyKey.findUnique({ where: { key: scopedKey } });
    // A duplicate resumes with the originally-stored result instead of null, so a
    // retried request returns the same ids/url the first call produced (TRD §10/§25).
    if (existing) {
      if (!binding) return { duplicate: true, result: (existing.response ?? null) as T | null };
      const saved = existing.response as { version?: number; requestFingerprint?: string; result?: T | null } | null;
      if (saved?.version !== 1 || saved.requestFingerprint !== binding.requestFingerprint) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'this idempotency key was used for a different request');
      }
      return { duplicate: true, result: saved.result ?? null };
    }
    if (binding?.legacyReplay) {
      const legacy = await tx.idempotencyKey.findUnique({ where: { key: legacyKey } });
      if (legacy && await binding.legacyReplay(tx, (legacy.response ?? null) as T | null)) {
        const result = (legacy.response ?? null) as T | null;
        await tx.idempotencyKey.create({ data: {
          key: scopedKey, scope,
          response: { version: 1, requestFingerprint: binding.requestFingerprint, result } as Prisma.InputJsonValue,
        } });
        return { duplicate: true, result };
      }
    }
    await tx.idempotencyKey.create({ data: { key: scopedKey, scope } });
    const result = await fn(tx);
    await tx.idempotencyKey.update({
      where: { key: scopedKey },
      data: {
        response: binding
          ? { version: 1, requestFingerprint: binding.requestFingerprint, result: result ?? null }
          :
          result === undefined || result === null
            ? Prisma.JsonNull
            : (result as Prisma.InputJsonValue),
      },
    });
    return { duplicate: false, result };
  }, { timeout: 30_000, maxWait: 30_000 });
}
