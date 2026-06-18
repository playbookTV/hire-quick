/**
 * Daily reconciliation (TRD §17) — the single most important operational alarm.
 * Compares the ledger-derived expected Paystack Balance to the actual balance,
 * and flags HELD allocations nearing the 90-day Manual Payouts rule (§10).
 *
 * expected = ΣHOLD + ΣREFUND(neg) + ΣCOMMISSION_SWEEP(neg) − Σ withdrawalsPaid
 * (RELEASE/FEE move money escrow→wallet but stay *inside* the Balance, so they
 * don't change it.)
 */
import { type PrismaClient } from '@hq/database';
import type { PaystackPort } from '../port/paystack-port.js';

export interface ReconResult {
  expectedKobo: number;
  actualKobo: number;
  driftKobo: number;
  ok: boolean;
  staleHeldBookingIds: string[];
}

export async function reconcile(
  prisma: PrismaClient,
  paystack: PaystackPort,
  opts: { staleAfterDays?: number; now?: Date } = {},
): Promise<ReconResult> {
  const [holds, refunds, sweeps, withdrawalsPaid] = await Promise.all([
    prisma.escrowLedger.aggregate({ where: { entryType: 'HOLD' }, _sum: { amount: true } }),
    prisma.escrowLedger.aggregate({ where: { entryType: 'REFUND' }, _sum: { amount: true } }),
    prisma.escrowLedger.aggregate({ where: { entryType: 'COMMISSION_SWEEP' }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
  ]);

  const expectedKobo =
    (holds._sum.amount ?? 0) +
    (refunds._sum.amount ?? 0) +
    (sweeps._sum.amount ?? 0) -
    (withdrawalsPaid._sum.amount ?? 0);

  const actualKobo = await paystack.getBalanceKobo();
  const driftKobo = actualKobo - expectedKobo;

  const staleAfterDays = opts.staleAfterDays ?? 80;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - staleAfterDays * 86_400_000);
  const staleHeld = await prisma.payment.findMany({
    where: { escrowStatus: 'HELD', createdAt: { lt: cutoff } },
    select: { bookingId: true },
  });

  return {
    expectedKobo,
    actualKobo,
    driftKobo,
    ok: driftKobo === 0 && staleHeld.length === 0,
    staleHeldBookingIds: staleHeld.map((p) => p.bookingId),
  };
}
