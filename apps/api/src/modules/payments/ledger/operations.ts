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
 * Drive a claimed operation to a terminal state. Safe to re-invoke on a
 * non-terminal op to resume it (the recovery job does exactly this). Returns the
 * onSuccess result on a fresh success, or null when the op was already terminal
 * (the value was not persisted — resume paths read their own domain rows).
 */
export async function runOperation<T>(
  prisma: PrismaClient,
  op: PaymentOperation,
  handlers: OperationHandlers<T>,
  txOpts?: TxOpts,
): Promise<{ status: 'RECORDED' | 'FAILED'; result: T | null }> {
  let current = op;
  if (current.status === 'RECORDED') return { status: 'RECORDED', result: null };
  if (current.status === 'FAILED') return { status: 'FAILED', result: null };

  if (current.status === 'PENDING') {
    let provider: ProviderResult;
    try {
      provider = await handlers.provider();
    } catch (e) {
      await prisma.paymentOperation.update({
        where: { id: current.id },
        data: { attempts: { increment: 1 }, lastError: e instanceof Error ? e.message : String(e) },
      });
      throw e;
    }
    if (!provider.ok) {
      // Provider reported failure → run the compensating write (if any) and stop.
      if (handlers.onFailure) {
        const fail = handlers.onFailure;
        await prisma.$transaction((tx) => fail(tx), txOpts);
      }
      await prisma.paymentOperation.update({
        where: { id: current.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, providerRef: provider.providerRef ?? current.providerRef },
      });
      return { status: 'FAILED', result: null };
    }
    current = await prisma.paymentOperation.update({
      where: { id: current.id },
      data: { status: 'PROVIDER_OK', attempts: { increment: 1 }, providerRef: provider.providerRef ?? current.providerRef },
    });
  }

  // PROVIDER_OK → record the ledger/state write, then mark RECORDED.
  const result = await prisma.$transaction((tx) => handlers.onSuccess(tx), txOpts);
  await prisma.paymentOperation.update({ where: { id: current.id }, data: { status: 'RECORDED' } });
  return { status: 'RECORDED', result };
}
