/**
 * Scheduled job functions (TRD §17, D1/D3). Thin wrappers over the already-
 * tested service/reconciliation functions, adding logging + alerting. The
 * BullMQ transport (queues.ts) just calls these on a cron.
 */
import { prisma } from '@hq/database';
import { autoComplete, noShowSweep } from '../bookings/service.js';
import { reconcile } from '../payments/ledger/reconciliation.js';
import { runCommissionSweep, type Deps } from '../payments/service.js';
import { env } from '../../env.js';

function log(message: string): void {
   
  console.log(`[job] ${message}`);
}

export async function jobAutoComplete(): Promise<void> {
  const r = await autoComplete();
  if (r.completed.length) log(`auto-completed ${String(r.completed.length)} booking(s)`);
}

export async function jobNoShow(): Promise<void> {
  const r = await noShowSweep();
  if (r.noShows.length) log(`flagged ${String(r.noShows.length)} no-show(s)`);
}

export async function jobReconcile(deps: Deps): Promise<void> {
  const r = await reconcile(prisma, deps.paystack);
  if (!r.ok) {
    log(`⚠ RECONCILIATION ALARM drift=${String(r.driftKobo)} stale=${String(r.staleHeldBookingIds.length)}`);
  } else {
    log('reconciliation ok');
  }
}

export async function jobCommissionSweep(deps: Deps): Promise<void> {
  if (!env.PAYSTACK_OPERATING_RECIPIENT) {
    log('commission sweep skipped: PAYSTACK_OPERATING_RECIPIENT not set');
    return;
  }
  const r = await runCommissionSweep(deps, { operatingRecipientCode: env.PAYSTACK_OPERATING_RECIPIENT });
  log(`commission swept: ${String(r.swept)} kobo`);
}

/** Surface withdrawals stuck in PROCESSING (no transfer webhook) for ops follow-up. */
export async function jobTransferRetry(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const stuck = await prisma.withdrawal.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stuck.length) log(`⚠ ${String(stuck.length)} withdrawal(s) stuck in PROCESSING >30m`);
}
