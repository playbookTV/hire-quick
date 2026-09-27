/** Durable intent → provider checkpoint → atomic ledger finalization (TRD §10/§17). */
import { Prisma, type PrismaClient, type PaymentOperation, type PaymentOpKind } from '@hq/database';

export interface ProviderResult {
  status: 'success' | 'failed' | 'pending' | 'unknown';
  providerRef?: string;
}

export interface OperationHandlers<T> {
  /** First dispatch only. No external call runs inside a database transaction. */
  provider: () => Promise<ProviderResult>;
  /** After a dispatch may have happened, reconcile before any safe reissue. */
  reconcile: () => Promise<ProviderResult>;
  onSuccess: (tx: Prisma.TransactionClient) => Promise<T>;
  onFailure?: (tx: Prisma.TransactionClient) => Promise<void>;
}

type TxOpts = { timeout?: number; maxWait?: number };
export type OperationStatus = 'PENDING' | 'RECORDED' | 'FAILED';

export async function claimOperation(
  prisma: PrismaClient,
  args: { kind: PaymentOpKind; dedupeKey: string; payload: Prisma.InputJsonValue },
): Promise<{ op: PaymentOperation; created: boolean }> {
  try {
    return { op: await prisma.paymentOperation.create({ data: args }), created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return {
        op: await prisma.paymentOperation.findUniqueOrThrow({
          where: { dedupeKey: args.dedupeKey },
        }),
        created: false,
      };
    }
    throw e;
  }
}

/**
 * `attempts` is committed BEFORE dispatch. Only its first claimant may invoke
 * provider(); other callers reconcile. A lost response never authorizes a refund
 * reissue. Transfers may reissue their deterministic reference after verification.
 * PROVIDER_OK survives a failed final transaction. Finalization locks/re-reads the
 * operation, and commits the ledger and RECORDED together, even across workers.
 */
export async function runOperation<T>(
  prisma: PrismaClient,
  op: PaymentOperation,
  handlers: OperationHandlers<T>,
  txOpts: TxOpts = { timeout: 30_000, maxWait: 30_000 },
): Promise<{ status: OperationStatus; result: T | null }> {
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${op.id}::uuid FOR UPDATE`;
    const row = await tx.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
    if (row.status === 'PENDING') {
      await tx.paymentOperation.update({
        where: { id: op.id },
        data: { attempts: { increment: 1 } },
      });
    }
    return row;
  }, txOpts);
  if (claimed.status === 'RECORDED' || claimed.status === 'FAILED')
    return { status: claimed.status, result: null };

  if (claimed.status === 'PENDING') {
    let evidence: ProviderResult;
    try {
      evidence = await (claimed.attempts === 0 ? handlers.provider() : handlers.reconcile());
    } catch {
      // Provider exceptions are ambiguous. Keep the intent and reservation; never
      // compensate a wallet merely because a response could not be received.
      await prisma.paymentOperation.updateMany({
        where: { id: op.id, status: 'PENDING' },
        data: { lastError: 'Provider outcome unknown; reconciliation required' },
      });
      return { status: 'PENDING', result: null };
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${op.id}::uuid FOR UPDATE`;
      const row = await tx.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
      if (row.status !== 'PENDING') return;
      if (evidence.status === 'failed') {
        await handlers.onFailure?.(tx);
        await tx.paymentOperation.update({
          where: { id: op.id },
          data: { status: 'FAILED', lastError: 'Provider confirmed failure' },
        });
      } else {
        await tx.paymentOperation.update({
          where: { id: op.id },
          data: {
            ...(evidence.status === 'success' ? { status: 'PROVIDER_OK' as const } : {}),
            providerRef: evidence.providerRef ?? row.providerRef,
            lastError:
              evidence.status === 'unknown'
                ? 'Provider outcome unknown; reconcile or review before reissuing'
                : null,
          },
        });
      }
    }, txOpts);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${op.id}::uuid FOR UPDATE`;
    const row = await tx.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
    if (row.status !== 'PROVIDER_OK') return { status: row.status, result: null };
    const result = await handlers.onSuccess(tx);
    await tx.paymentOperation.update({
      where: { id: op.id },
      data: { status: 'RECORDED', lastError: null },
    });
    return { status: 'RECORDED' as const, result };
  }, txOpts);
}
