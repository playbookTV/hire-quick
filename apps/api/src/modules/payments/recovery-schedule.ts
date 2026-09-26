import type { PrismaClient, Prisma, PaymentOperation } from '@hq/database';
import { writeAudit } from '../audit.js';

export const MAX_RECOVERY_ATTEMPTS = 12;
export const RECOVERY_GRACE_MS = 5 * 60_000;
export function recoveryDelay(attempt: number): number {
  return Math.min(6 * 3_600_000, RECOVERY_GRACE_MS * 2 ** Math.min(attempt - 1, 10));
}

/** Claim a bounded batch with SKIP LOCKED; failures cannot monopolize the queue.
 * The lease is committed before processing, including crashes and error paths.
 * One atomic update avoids 100 serial round trips expiring the transaction.
 * Dispatch attempts remain separate: resetting recovery never permits a new refund.
 */
export async function claimRecoveryBatch(prisma: PrismaClient, now = new Date()) {
  return prisma.$transaction(
    (tx) => tx.$queryRaw<PaymentOperation[]>`
      WITH eligible AS (
        SELECT id FROM payment_operations
        WHERE status IN ('PENDING', 'PROVIDER_OK') AND "quarantinedAt" IS NULL
          AND "updatedAt" < ${new Date(now.getTime() - RECOVERY_GRACE_MS)}
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
        ORDER BY "nextAttemptAt" ASC NULLS FIRST, "updatedAt" ASC, id ASC
        LIMIT 100 FOR UPDATE SKIP LOCKED
      )
      UPDATE payment_operations AS op
      SET "recoveryAttempts" = op."recoveryAttempts" + 1,
          "nextAttemptAt" = ${now}::timestamptz + (
            LEAST(${recoveryDelay(MAX_RECOVERY_ATTEMPTS)}::double precision,
              ${RECOVERY_GRACE_MS}::double precision * power(2, LEAST(op."recoveryAttempts", 10)))
            * INTERVAL '1 millisecond'
          ),
          "quarantinedAt" = CASE WHEN op."recoveryAttempts" + 1 >= ${MAX_RECOVERY_ATTEMPTS}
            THEN ${now}::timestamptz ELSE NULL END,
          "updatedAt" = ${now}::timestamptz
      FROM eligible WHERE op.id = eligible.id
      RETURNING op.*`,
    { timeout: 30_000, maxWait: 30_000 },
  );
}

export async function reviewRecovery(
  tx: Prisma.TransactionClient,
  args: { id: string; actorId: string; action: 'quarantine' | 'resume'; evidence: string },
) {
  await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${args.id}::uuid FOR UPDATE`;
  const op = await tx.paymentOperation.findUniqueOrThrow({ where: { id: args.id } });
  if (op.status === 'RECORDED' || op.status === 'FAILED') return op;
  const updated = await tx.paymentOperation.update({
    where: { id: op.id },
    data:
      args.action === 'quarantine'
        ? { quarantinedAt: new Date() }
        : { quarantinedAt: null, recoveryAttempts: 0, nextAttemptAt: new Date() },
  });
  await writeAudit(
    {
      actorId: args.actorId,
      action: `payment.recovery.${args.action}`,
      target: op.id,
      metadata: { evidence: args.evidence, status: op.status, attempts: op.attempts },
    },
    tx,
  );
  return updated;
}
