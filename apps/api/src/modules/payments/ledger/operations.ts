/**
 * Durable cross-system operation runner (TRD §10/§17).
 *
 * Every Paystack call that must be paired with a ledger/state write goes through
 * a PaymentOperation record so that:
 *  - a concurrent retry is deduped by `dedupeKey` BEFORE the provider is called
 *    (the unique constraint is the serialization point), and
 *  - a crash between the provider call and the ledger write is resumable
 *    (status advances PENDING → PROVIDER_OK → RECORDED, or → FAILED).
 *
 * This is the single mechanism behind refund, withdrawal-transfer,
 * commission-sweep and approval-execute. It is orchestration metadata only — it
 * writes no ledger rows and does not affect the §17 reconciliation formula.
 */
import { Prisma, type PrismaClient, type PaymentOperation, type PaymentOpKind } from '@hq/database';

const P2002 = 'P2002'; // Prisma unique-constraint violation

export interface ProviderResult {
  /** false → provider explicitly reported failure (not a thrown error). */
  ok: boolean;
  /** Deterministic provider reference to persist (transfers/sweeps). */
  providerRef?: string;
}

export interface OperationHandlers<T> {
  /** Idempotent provider (Paystack) call. */
  provider: () => Promise<ProviderResult>;
  /** Ledger/state write when the provider succeeded; runs in its own tx. */
  onSuccess: (tx: Prisma.TransactionClient) => Promise<T>;
  /** Compensating ledger write when the provider reported failure (e.g. REVERSAL). */
  onFailure?: (tx: Prisma.TransactionClient) => Promise<void>;
}

type TxOpts = { timeout?: number; maxWait?: number };

/**
 * Claim a durable operation by its dedupeKey. A concurrent second caller loses
 * the unique insert and gets the existing record back (`created: false`), so the
 * provider call is never issued twice.
 */
export async function claimOperation(
  prisma: PrismaClient,
  args: { kind: PaymentOpKind; dedupeKey: string; payload: Prisma.InputJsonValue },
): Promise<{ op: PaymentOperation; created: boolean }> {
  try {
    const op = await prisma.paymentOperation.create({
      data: { kind: args.kind, dedupeKey: args.dedupeKey, payload: args.payload },
    });
    return { op, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === P2002) {
      const op = await prisma.paymentOperation.findUniqueOrThrow({ where: { dedupeKey: args.dedupeKey } });
      return { op, created: false };
    }
    throw e;
  }
}

/**
 * Drive a claimed operation to a terminal state, exactly once. The operation row
 * is locked FOR UPDATE for the whole run, so a concurrent retry that shares the
 * same `dedupeKey` blocks here and — once the winner commits — re-reads a terminal
 * status and returns without re-invoking the provider. This row lock (on a single
 * orchestration row, not on bookings/wallets) is what actually closes the
 * double-refund / double-transfer race. Safe to re-invoke to resume a crash:
 * PROVIDER_OK skips straight to recording. Returns the onSuccess result on a fresh
 * success, or null when the op was already terminal on entry.
 *
 * NOTE: the provider (Paystack) call runs inside the transaction so at-most-once
 * holds; pass a generous timeout via txOpts for live HTTP (defaults to 30s).
 */
export async function runOperation<T>(
  prisma: PrismaClient,
  op: PaymentOperation,
  handlers: OperationHandlers<T>,
  txOpts: TxOpts = { timeout: 30_000, maxWait: 30_000 },
): Promise<{ status: 'RECORDED' | 'FAILED'; result: T | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${op.id}::uuid FOR UPDATE`;
    let row = await tx.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
    if (row.status === 'RECORDED') return { status: 'RECORDED' as const, result: null };
    if (row.status === 'FAILED') return { status: 'FAILED' as const, result: null };

    if (row.status === 'PENDING') {
      const provider = await handlers.provider();
      if (!provider.ok) {
        if (handlers.onFailure) await handlers.onFailure(tx);
        await tx.paymentOperation.update({
          where: { id: row.id },
          data: { status: 'FAILED', attempts: { increment: 1 }, providerRef: provider.providerRef ?? row.providerRef },
        });
        return { status: 'FAILED' as const, result: null };
      }
      row = await tx.paymentOperation.update({
        where: { id: row.id },
        data: { status: 'PROVIDER_OK', attempts: { increment: 1 }, providerRef: provider.providerRef ?? row.providerRef },
      });
    }

    // PROVIDER_OK → record the ledger/state write, then mark RECORDED.
    const result = await handlers.onSuccess(tx);
    await tx.paymentOperation.update({ where: { id: row.id }, data: { status: 'RECORDED' } });
    return { status: 'RECORDED' as const, result };
  }, txOpts);
}
