/** Daily balance evidence (TRD §17). Provider reads cannot share a DB snapshot. */
import { randomUUID } from 'node:crypto';
import { type PrismaClient, type LedgerEntryType } from '@hq/database';
import type { PaystackPort } from '../port/paystack-port.js';
import { writeAudit } from '../../audit.js';

// Every new ledger type must explicitly declare its effect on provider balance.
export const PROVIDER_BALANCE_EFFECT: Record<LedgerEntryType, 0 | 1> = {
  HOLD: 1,
  REFUND: 1,
  COMMISSION_SWEEP: 1,
  RELEASE: 0,
  FEE: 0,
  REVERSAL: 0,
};

export interface ReconResult {
  expectedKobo: number;
  actualKobo: number;
  driftKobo: number;
  ok: boolean;
  staleHeldBookingIds: string[];
  staleFrozenBookingIds: string[];
  pendingOperations: number;
  quarantinedOperations: number;
  classification: 'balanced' | 'drift' | 'in_flight' | 'review';
  snapshotChanged: boolean;
}

async function snapshot(prisma: PrismaClient, cutoff: Date) {
  return prisma.$transaction(
    async (tx) => {
      const entries = await tx.escrowLedger.groupBy({
        by: ['entryType'],
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { entryType: 'asc' },
      });
      const withdrawals = await tx.withdrawal.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const operations = await tx.paymentOperation.aggregate({
        where: { status: { in: ['PENDING', 'PROVIDER_OK'] } },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      const quarantinedOperations = await tx.paymentOperation.count({
        where: { status: { in: ['PENDING', 'PROVIDER_OK'] }, quarantinedAt: { not: null } },
      });
      const processingWithdrawals = await tx.withdrawal.count({ where: { status: 'PROCESSING' } });
      const stale = await tx.payment.findMany({
        where: { escrowStatus: { in: ['HELD', 'FROZEN'] }, createdAt: { lt: cutoff } },
        select: { bookingId: true, escrowStatus: true },
        orderBy: { bookingId: 'asc' },
      });
      const expectedKobo =
        entries.reduce(
          (sum, e) => sum + (e._sum.amount ?? 0) * PROVIDER_BALANCE_EFFECT[e.entryType],
          0,
        ) - (withdrawals._sum.amount ?? 0);
      if (!Number.isSafeInteger(expectedKobo))
        throw new Error('Reconciliation exceeds safe integer range');
      return {
        entries,
        withdrawals,
        operations,
        quarantinedOperations,
        processingWithdrawals,
        stale,
        expectedKobo,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 30_000, maxWait: 30_000 },
  );
}

async function collect(
  prisma: PrismaClient,
  paystack: PaystackPort,
  opts: { staleAfterDays?: number; now?: Date } = {},
) {
  const startedAt = opts.now ?? new Date();
  const cutoff = new Date(startedAt.getTime() - (opts.staleAfterDays ?? 80) * 86_400_000);
  const before = await snapshot(prisma, cutoff);
  const providerReadStartedAt = new Date().toISOString();
  const actualKobo = await paystack.getBalanceKobo();
  if (!Number.isSafeInteger(actualKobo)) throw new Error('Invalid provider balance');
  const providerReadFinishedAt = new Date().toISOString();
  const after = await snapshot(prisma, cutoff);
  const snapshotChanged = JSON.stringify(before) !== JSON.stringify(after);
  const driftKobo = actualKobo - before.expectedKobo;
  const staleHeldBookingIds = before.stale
    .filter((p) => p.escrowStatus === 'HELD')
    .map((p) => p.bookingId);
  const staleFrozenBookingIds = before.stale
    .filter((p) => p.escrowStatus === 'FROZEN')
    .map((p) => p.bookingId);
  const pendingOperations = before.operations._count._all;
  const inFlight = snapshotChanged || pendingOperations > 0 || before.processingWithdrawals > 0;
  const classification = inFlight
    ? 'in_flight'
    : driftKobo !== 0
      ? 'drift'
      : before.stale.length
        ? 'review'
        : 'balanced';
  const result: ReconResult = {
    expectedKobo: before.expectedKobo,
    actualKobo,
    driftKobo,
    ok: classification === 'balanced',
    classification,
    snapshotChanged,
    staleHeldBookingIds,
    staleFrozenBookingIds,
    pendingOperations,
    quarantinedOperations: before.quarantinedOperations,
  };
  return {
    result,
    evidence: {
      startedAt: startedAt.toISOString(),
      cutoff: cutoff.toISOString(),
      providerReadStartedAt,
      providerReadFinishedAt,
      before,
      after,
    },
  };
}

export async function reconcile(
  prisma: PrismaClient,
  paystack: PaystackPort,
  opts: { staleAfterDays?: number; now?: Date } = {},
): Promise<ReconResult> {
  return (await collect(prisma, paystack, opts)).result;
}

/** Durable audit rows are the run history; investigations append separate rows. */
export async function recordReconciliation(prisma: PrismaClient, paystack: PaystackPort) {
  const runId = randomUUID();
  try {
    const { result, evidence } = await collect(prisma, paystack);
    await prisma.$transaction((tx) =>
      writeAudit(
        {
          actorId: null,
          action: 'reconciliation.run',
          target: runId,
          metadata: JSON.parse(JSON.stringify({ ...result, evidence })) as Record<string, unknown>,
        },
        tx,
      ),
    );
    return { runId, ...result };
  } catch (error) {
    await prisma.$transaction((tx) =>
      writeAudit(
        {
          actorId: null,
          action: 'reconciliation.error',
          target: runId,
          metadata: {
            message:
              'Balance evidence could not be collected; investigate provider and database availability',
          },
        },
        tx,
      ),
    );
    throw error;
  }
}
