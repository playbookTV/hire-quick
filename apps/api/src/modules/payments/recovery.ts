/** Recovery uses the same durable protocol as the synchronous payment paths. */
import { completeWithdrawal, LedgerError } from './ledger/ledger.js';
import type { PaymentOperation } from '@hq/database';
import { executeApprovalOp } from '../admin/service.js';
import { driveRefund, driveTransfer, ensureWithdrawalOperation, type Deps } from './service.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { driveWithdrawalReversal, recordWithdrawalReversal } from './withdrawal-reversal.js';

export type ResumeResult = 'recorded' | 'failed' | 'pending' | 'skipped';

export async function resumePaymentOperation(
  deps: Deps,
  op: PaymentOperation,
  realtime: RealtimeGateway = noopGateway,
): Promise<ResumeResult> {
  let result;
  switch (op.kind) {
    case 'WITHDRAWAL_TRANSFER':
    case 'COMMISSION_SWEEP':
      result = await driveTransfer(deps, op);
      break;
    case 'BOOKING_REFUND':
      result = await driveRefund(deps, op);
      break;
    case 'APPROVAL_EXECUTE': {
      const payload = op.payload as { approvalId: string };
      const approval = await deps.prisma.approval.findUniqueOrThrow({
        where: { id: payload.approvalId },
      });
      result = await executeApprovalOp(approval, deps.paystack, realtime);
      break;
    }
    default:
      return 'skipped';
  }
  return result.status === 'RECORDED'
    ? 'recorded'
    : result.status === 'FAILED'
      ? 'failed'
      : 'pending';
}

/** Repair legacy withdrawal intents as well as missed terminal webhooks. */
export async function reconcileStuckWithdrawals(
  deps: Deps,
  olderThanMs = 30 * 60_000,
  scheduled = false,
) {
  const stuck = await deps.prisma.withdrawal.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { id: true },
  });
  const counts = { completed: 0, failed: 0, pending: 0 };
  for (const w of stuck) {
    const op = await ensureWithdrawalOperation(deps, w.id);
    const resumeKnownReversal = async (): Promise<boolean> => {
      const reversal = await deps.prisma.paymentOperation.findUnique({
        where: { dedupeKey: `WITHDRAWAL_REVERSAL:${w.id}` },
      });
      if (!reversal) return false;
      if (scheduled) {
        counts.pending += 1;
        return true;
      }
      try {
        await driveWithdrawalReversal(deps.prisma, reversal);
        counts.failed += 1;
      } catch (error) {
        if (!(error instanceof LedgerError) || error.code !== 'BALANCE_LIMIT') throw error;
        counts.pending += 1;
      }
      return true;
    };
    if (await resumeKnownReversal()) continue;
    // The previous runner marked an accepted transfer RECORDED while leaving
    // its withdrawal PROCESSING. Reconcile that legacy state without reopening
    // a terminal operation or issuing a new transfer.
    if (op.status === 'RECORDED') {
      const p = op.payload as { reference: string };
      const verified = await deps.paystack.verifyTransfer(p.reference);
      if (await resumeKnownReversal()) continue;
      if (verified.status === 'success') {
        await deps.prisma.$transaction((tx) => completeWithdrawal(tx, w.id, p.reference));
        counts.completed += 1;
      } else if (verified.status === 'failed') {
        await recordWithdrawalReversal(deps.prisma, w.id, p.reference);
        await resumeKnownReversal();
      } else counts.pending += 1;
      continue;
    }
    if (scheduled) {
      counts.pending += 1;
      continue;
    }
    const result = await driveTransfer(deps, op);
    if (result.status === 'RECORDED') {
      const settled = await deps.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
      if (settled.status === 'FAILED') counts.failed += 1;
      else counts.completed += 1;
    } else if (result.status === 'FAILED') counts.failed += 1;
    else counts.pending += 1;
  }
  return counts;
}
