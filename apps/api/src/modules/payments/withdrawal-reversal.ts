import { type PrismaClient, type PaymentOperation } from '@hq/database';
import { LedgerError, failWithdrawal } from './ledger/ledger.js';
import { runOperation } from './ledger/operations.js';

interface ReversalPayload {
  action: 'REVERSE';
  withdrawalId: string;
  amountKobo: number;
  reversalReference: string;
}

export function isWithdrawalReversal(op: PaymentOperation): boolean {
  return op.kind === 'WITHDRAWAL_TRANSFER' &&
    (op.payload as { action?: string }).action === 'REVERSE';
}

/** Persist verified terminal failure before trying a potentially capacity-blocked credit. */
export async function recordWithdrawalReversal(
  prisma: PrismaClient,
  withdrawalId: string,
  reference: string,
): Promise<PaymentOperation> {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (reference !== (withdrawal.paystackTransferRef ?? `wd_${withdrawal.id}`))
    throw new Error('Transfer failure reference does not match withdrawal');
  const dedupeKey = `WITHDRAWAL_REVERSAL:${withdrawalId}`;
  await prisma.paymentOperation.createMany({
    data: [{
      kind: 'WITHDRAWAL_TRANSFER', dedupeKey, status: 'PROVIDER_OK', attempts: 1,
      providerRef: reference,
      lastError: 'Provider confirmed transfer failure or reversal; local wallet credit pending',
      // Deliberately distinct from normal payload.reference: transfer callbacks
      // must continue to locate the original dispatch intent.
      payload: { action: 'REVERSE', withdrawalId, amountKobo: withdrawal.amount, reversalReference: reference },
    }],
    skipDuplicates: true,
  });
  return prisma.paymentOperation.findUniqueOrThrow({ where: { dedupeKey } });
}

/** Recovery of this intent only credits the wallet. It can never dispatch a transfer. */
export async function driveWithdrawalReversal(prisma: PrismaClient, op: PaymentOperation) {
  if (!isWithdrawalReversal(op)) throw new Error('Expected withdrawal reversal intent');
  const p = op.payload as unknown as ReversalPayload;
  try {
    return await runOperation(prisma, op, {
      provider: () => { throw new Error('Reversal intent requires persisted provider evidence'); },
      reconcile: () => { throw new Error('Reversal intent requires persisted provider evidence'); },
      onSuccess: async (tx) => {
        const originalKey = `WITHDRAWAL_TRANSFER:${p.withdrawalId}`;
        await tx.$queryRaw`SELECT id FROM payment_operations WHERE "dedupeKey" = ${originalKey} FOR UPDATE`;
        const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: p.withdrawalId } });
        if (withdrawal.amount !== p.amountKobo ||
            (withdrawal.paystackTransferRef ?? `wd_${withdrawal.id}`) !== p.reversalReference)
          throw new Error('Reversal intent does not match withdrawal');
        const changed = await failWithdrawal(tx, p.withdrawalId);
        await tx.paymentOperation.updateMany({
          where: { dedupeKey: originalKey },
          data: { status: 'FAILED', lastError: 'Provider confirmed transfer failure or reversal' },
        });
        return changed;
      },
    });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'BALANCE_LIMIT') {
      await prisma.paymentOperation.updateMany({
        where: { id: op.id, status: 'PROVIDER_OK' },
        data: { lastError: 'BALANCE_LIMIT: verified transfer reversal awaits wallet capacity; retry this intent without sending a transfer' },
      });
    }
    throw error;
  }
}
