/**
 * Idempotency guard (TRD §10/§25). Wraps a money operation so a retried request
 * or replayed webhook produces exactly one effect. The key insert and the work
 * share one transaction, so a failure rolls back both (the key won't block a
 * legitimate retry). Scopes per §10: order_id | booking_id | withdrawal_id |
 * paystack_event_id.
 */
import { type Prisma, type PrismaClient } from '@hq/database';

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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.idempotencyKey.findUnique({ where: { key } });
    if (existing) return { duplicate: true, result: null };
    await tx.idempotencyKey.create({ data: { key, scope } });
    const result = await fn(tx);
    return { duplicate: false, result };
  });
}
