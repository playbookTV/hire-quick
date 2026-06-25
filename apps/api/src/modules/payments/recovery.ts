/**
 * Recovery for durable payment operations (TRD §10/§17).
 *
 * Two complementary passes, both safe to run repeatedly:
 *  - resumePaymentOperation: drives a non-terminal PaymentOperation (PENDING /
 *    PROVIDER_OK) to completion after a crash, reconciling against Paystack's
 *    authoritative state where a provider call may or may not have landed.
 *  - reconcileStuckWithdrawals: finalises withdrawals stuck in PROCESSING because
 *    their transfer webhook was lost — verifying the transfer and applying the
 *    terminal transition. This replaces the previous log-only "transfer retry".
 *
 * All ledger calls here are idempotent (completeWithdrawal/failWithdrawal no-op on
 * terminal state; refunds resume their own durable op), so a resume never
 * double-pays or double-records.
 */
import { prisma, type PaymentOperation } from '@hq/database';
import { completeWithdrawal, failWithdrawal, commissionSweep, cancelBooking, markNoShow, refundBooking } from './ledger/ledger.js';
import { executeApprovalOp } from '../admin/service.js';
import type { Deps } from './service.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';

export type ResumeResult = 'recorded' | 'failed' | 'pending' | 'skipped';

async function markOp(id: string, status: 'PROVIDER_OK' | 'RECORDED' | 'FAILED'): Promise<void> {
  await prisma.paymentOperation.update({ where: { id }, data: { status } });
}

/** Resume one non-terminal durable operation. */
export async function resumePaymentOperation(
  deps: Deps,
  op: PaymentOperation,
  realtime: RealtimeGateway = noopGateway,
): Promise<ResumeResult> {
  switch (op.kind) {
    case 'WITHDRAWAL_TRANSFER':
      return resumeWithdrawalTransfer(deps, op);
    case 'COMMISSION_SWEEP':
      return resumeCommissionSweep(deps, op);
    case 'BOOKING_REFUND':
      return resumeBookingRefund(deps, op);
    case 'APPROVAL_EXECUTE':
      return resumeApprovalExecute(deps, op, realtime);
    default:
      return 'skipped';
  }
}

async function resumeWithdrawalTransfer(deps: Deps, op: PaymentOperation): Promise<ResumeResult> {
  const p = op.payload as { withdrawalId: string; amountKobo: number; recipientCode: string; reference: string };
  // Determine the authoritative transfer status; if it never issued, re-issue
  // (idempotent by reference) so a crash before the provider call still settles.
  let status = (await deps.paystack.verifyTransfer(p.reference)).status;
  if (status === 'unknown' && op.status === 'PENDING') {
    const t = await deps.paystack.transfer({
      amountKobo: p.amountKobo,
      recipientCode: p.recipientCode,
      reason: 'HireQuick payout',
      reference: p.reference,
    });
    status = t.status === 'failed' ? 'failed' : 'success';
  }
  if (status === 'success') {
    await deps.prisma.$transaction((tx) => completeWithdrawal(tx, p.withdrawalId, p.reference));
    await markOp(op.id, 'RECORDED');
    return 'recorded';
  }
  if (status === 'failed') {
    await deps.prisma.$transaction((tx) => failWithdrawal(tx, p.withdrawalId));
    await markOp(op.id, 'FAILED');
    return 'failed';
  }
  return 'pending'; // pending/unknown — try again next cycle
}

async function resumeCommissionSweep(deps: Deps, op: PaymentOperation): Promise<ResumeResult> {
  const p = op.payload as { amountKobo: number; recipientCode: string; reference: string };
  let status: 'success' | 'failed' | 'pending' | 'unknown' =
    op.status === 'PROVIDER_OK' ? 'success' : (await deps.paystack.verifyTransfer(p.reference)).status;
  if (status === 'unknown' && op.status === 'PENDING') {
    const t = await deps.paystack.transfer({
      amountKobo: p.amountKobo,
      recipientCode: p.recipientCode,
      reason: 'HireQuick commission sweep',
      reference: p.reference,
    });
    status = t.status === 'failed' ? 'failed' : 'success';
  }
  if (status === 'success') {
    await deps.prisma.$transaction((tx) => commissionSweep(tx, p.amountKobo));
    await markOp(op.id, 'RECORDED');
    return 'recorded';
  }
  if (status === 'failed') {
    await markOp(op.id, 'FAILED');
    return 'failed';
  }
  return 'pending';
}

async function resumeBookingRefund(deps: Deps, op: PaymentOperation): Promise<ResumeResult> {
  const p = op.payload as { bookingId: string; amountKobo: number; precursor: 'CANCEL' | 'NO_SHOW' | null };
  // Only resume the ledger write when the Paystack refund already succeeded.
  // A PENDING refund op is NOT blind-retried — Paystack refunds carry no client
  // reference to verify against, and the unique claim already prevented a double
  // refund; surface it for ops instead (residual reconciliation-drift tradeoff).
  if (op.status !== 'PROVIDER_OK') return 'pending';
  await deps.prisma.$transaction(async (tx) => {
    if (p.precursor === 'CANCEL') await cancelBooking(tx, p.bookingId);
    else if (p.precursor === 'NO_SHOW') await markNoShow(tx, p.bookingId);
    await refundBooking(tx, p.bookingId, p.amountKobo);
  });
  await markOp(op.id, 'RECORDED');
  return 'recorded';
}

async function resumeApprovalExecute(deps: Deps, op: PaymentOperation, realtime: RealtimeGateway): Promise<ResumeResult> {
  const p = op.payload as { approvalId: string };
  const approval = await prisma.approval.findUnique({ where: { id: p.approvalId } });
  if (!approval) {
    await markOp(op.id, 'FAILED');
    return 'failed';
  }
  // executeApprovalOp re-claims this same op (by dedupeKey) and resumes it; the
  // underlying refund/release are idempotent, so re-running never double-pays.
  await executeApprovalOp(approval, deps.paystack, realtime);
  return 'recorded';
}

/**
 * Finalise withdrawals stuck in PROCESSING (transfer webhook lost) by verifying
 * the transfer with Paystack and applying the terminal transition. Idempotent.
 */
export async function reconcileStuckWithdrawals(
  deps: Deps,
  olderThanMs = 30 * 60_000,
): Promise<{ completed: number; failed: number; pending: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stuck = await deps.prisma.withdrawal.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
    select: { id: true, paystackTransferRef: true },
  });
  let completed = 0;
  let failed = 0;
  let pending = 0;
  for (const w of stuck) {
    const ref = w.paystackTransferRef ?? `wd_${w.id}`;
    const { status } = await deps.paystack.verifyTransfer(ref);
    if (status === 'success') {
      await deps.prisma.$transaction((tx) => completeWithdrawal(tx, w.id, ref));
      completed += 1;
    } else if (status === 'failed') {
      await deps.prisma.$transaction((tx) => failWithdrawal(tx, w.id));
      failed += 1;
    } else {
      pending += 1;
    }
  }
  return { completed, failed, pending };
}
