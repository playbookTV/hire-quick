/**
 * Idempotency guard (TRD §10/§25). Wraps a money operation so a retried request
 * or replayed webhook produces exactly one effect. The key insert and the work
 * share one transaction, so a failure rolls back both (the key won't block a
 * legitimate retry). Scopes per §10: order_id | booking_id | withdrawal_id |
 * paystack_event_id.
 */
import { Prisma, type PrismaClient } from '@hq/database';

export interface IdempotentResult<T> {
  duplicate: boolean;
  result: T | null;
}

export async function runIdempotent<T>(
  prisma: PrismaClient,
  key: string,
  scope: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<IdempotentResult<T>> {
  // Namespace by scope so the same caller-supplied key in two scopes (e.g. a
  // withdrawal key vs a paystack_event_id key) can never collide. §10 scopes:
  // order_id | booking_id | withdrawal_id | paystack_event_id.
  const scopedKey = `${scope}:${key}`;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.idempotencyKey.findUnique({ where: { key: scopedKey } });
    // A duplicate resumes with the originally-stored result instead of null, so a
    // retried request returns the same ids/url the first call produced (TRD §10/§25).
    if (existing) return { duplicate: true, result: (existing.response ?? null) as T | null };
    await tx.idempotencyKey.create({ data: { key: scopedKey, scope } });
    const result = await fn(tx);
    await tx.idempotencyKey.update({
      where: { key: scopedKey },
      data: {
        response:
          result === undefined || result === null
            ? Prisma.JsonNull
            : (result as Prisma.InputJsonValue),
      },
    });
    return { duplicate: false, result };
  });
}
