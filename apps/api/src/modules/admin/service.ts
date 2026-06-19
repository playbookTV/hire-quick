/**
 * Admin money actions with maker-checker (TRD §15). A money move above the
 * threshold creates a PENDING Approval (maker); a *different* admin (checker)
 * approves to execute. Below the threshold it executes immediately. Every step
 * is audit-logged.
 */
import { prisma } from '@hq/database';
import { ApiError } from '../../app.js';
import { resolveDisputeRelease, refundBooking, cancelBooking } from '../payments/ledger/ledger.js';
import { notifyPayoutReleased } from '../notifications/service.js';
import { kobo } from '@hq/shared';
import { writeAudit } from '../audit.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
export const APPROVAL_THRESHOLD_KOBO = 5_000_000; // ₦50,000

export type DisputeOutcome = 'RELEASE' | 'REFUND';

async function executeDisputeResolution(p: {
  bookingId: string;
  outcome: DisputeOutcome;
  disputeId: string;
  resolution: string;
  adminId: string;
}): Promise<void> {
  if (p.outcome === 'RELEASE') {
    await prisma.$transaction((tx) => resolveDisputeRelease(tx, p.bookingId), TX);
    const b = await prisma.booking.findUnique({
      where: { id: p.bookingId },
      include: { usher: true, payment: true },
    });
    if (b?.payment) notifyPayoutReleased(b.usher.userId, kobo(b.payment.usherPayout));
  } else {
    const payment = await prisma.payment.findUnique({ where: { bookingId: p.bookingId } });
    await prisma.$transaction((tx) => refundBooking(tx, p.bookingId, payment?.grossAmount ?? 0), TX);
  }
  await prisma.dispute.update({
    where: { id: p.disputeId },
    data: { status: 'RESOLVED', resolution: p.resolution, resolvedById: p.adminId },
  });
}

async function executeRefund(p: { bookingId: string; amountKobo: number }): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: p.bookingId } });
  await prisma.$transaction(async (tx) => {
    if (booking.status === 'CONFIRMED') await cancelBooking(tx, p.bookingId);
    await refundBooking(tx, p.bookingId, p.amountKobo);
  }, TX);
}

export async function resolveDispute(
  adminId: string,
  disputeId: string,
  outcome: DisputeOutcome,
  resolution: string,
): Promise<{ executed: boolean; approvalId?: string }> {
  const dispute = await prisma.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: { booking: { include: { payment: true } } },
  });
  if (dispute.status === 'RESOLVED') throw new ApiError(409, 'ALREADY_RESOLVED', 'dispute already resolved');
  const amount = dispute.booking.payment?.grossAmount ?? 0;

  if (amount > APPROVAL_THRESHOLD_KOBO) {
    const approval = await prisma.approval.create({
      data: {
        kind: 'DISPUTE_RESOLVE',
        amountKobo: amount,
        makerId: adminId,
        payload: { disputeId, bookingId: dispute.bookingId, outcome, resolution },
      },
    });
    await prisma.dispute.update({ where: { id: disputeId }, data: { status: 'UNDER_REVIEW' } });
    await writeAudit({ actorId: adminId, action: 'dispute.resolve.proposed', target: disputeId, metadata: { outcome, amount } });
    return { executed: false, approvalId: approval.id };
  }

  await executeDisputeResolution({ bookingId: dispute.bookingId, outcome, disputeId, resolution, adminId });
  await writeAudit({ actorId: adminId, action: 'dispute.resolve', target: disputeId, metadata: { outcome } });
  return { executed: true };
}

export async function createRefund(
  adminId: string,
  bookingId: string,
  amountKobo: number,
  reason: string,
): Promise<{ executed: boolean; approvalId?: string }> {
  if (amountKobo > APPROVAL_THRESHOLD_KOBO) {
    const approval = await prisma.approval.create({
      data: {
        kind: 'REFUND',
        amountKobo,
        makerId: adminId,
        payload: { bookingId, amountKobo, reason },
      },
    });
    await writeAudit({ actorId: adminId, action: 'refund.proposed', target: bookingId, metadata: { amountKobo } });
    return { executed: false, approvalId: approval.id };
  }
  await executeRefund({ bookingId, amountKobo });
  await writeAudit({ actorId: adminId, action: 'refund', target: bookingId, metadata: { amountKobo, reason } });
  return { executed: true };
}

export async function decideApproval(
  checkerId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  const a = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (a.status !== 'PENDING') throw new ApiError(409, 'NOT_PENDING', 'approval already decided');
  if (a.makerId === checkerId) throw new ApiError(403, 'SAME_ADMIN', 'checker must differ from maker');

  if (decision === 'reject') {
    await prisma.approval.update({ where: { id: approvalId }, data: { status: 'REJECTED', checkerId } });
    await writeAudit({ actorId: checkerId, action: 'approval.reject', target: approvalId });
    return;
  }

  const payload = a.payload as Record<string, unknown>;
  if (a.kind === 'DISPUTE_RESOLVE') {
    await executeDisputeResolution({
      bookingId: String(payload.bookingId),
      outcome: payload.outcome as DisputeOutcome,
      disputeId: String(payload.disputeId),
      resolution: typeof payload.resolution === 'string' ? payload.resolution : '',
      adminId: a.makerId,
    });
  } else {
    await executeRefund({ bookingId: String(payload.bookingId), amountKobo: Number(payload.amountKobo) });
  }
  await prisma.approval.update({ where: { id: approvalId }, data: { status: 'EXECUTED', checkerId } });
  await writeAudit({ actorId: checkerId, action: 'approval.execute', target: approvalId });
}
