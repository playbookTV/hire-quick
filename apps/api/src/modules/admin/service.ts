/**
 * Admin money actions with maker-checker (TRD §15). A money move above the
 * threshold creates a PENDING Approval (maker); a *different* admin (checker)
 * approves to execute. Below the threshold it executes immediately. Every step
 * is audit-logged.
 */
import { prisma, type ApprovalKind } from '@hq/database';
import { ApiError } from '../../app.js';
import { resolveDisputeRelease, assertRefundable } from '../payments/ledger/ledger.js';
import { claimOperation, runOperation } from '../payments/ledger/operations.js';
import { refundBookingToClient } from '../payments/service.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { notifyPayoutReleased, notifyMilestoneUnlocked } from '../notifications/service.js';
import { kobo } from '@hq/shared';
import { writeAudit } from '../audit.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { RT, bookingEvent } from '../../realtime/events.js';
import { loadBookingParties } from '../../realtime/messages.js';
import { lockBookingLifecycle } from '../events/staffing.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
export const APPROVAL_THRESHOLD_KOBO = 5_000_000; // ₦50,000

export type DisputeOutcome = 'RELEASE' | 'REFUND';

async function executeDisputeResolution(
  p: {
    bookingId: string;
    outcome: DisputeOutcome;
    disputeId: string;
    resolution: string;
    adminId: string;
  },
  paystack: PaystackPort,
  realtime: RealtimeGateway,
): Promise<boolean> {
  if (p.outcome === 'RELEASE') {
    const unlocked = await prisma.$transaction(async (tx) => {
      await lockBookingLifecycle(tx, p.bookingId);
      const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: p.disputeId } });
      if (dispute.status === 'RESOLVED') return [];
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: p.bookingId },
        include: { payment: true },
      });
      // Repair the old release-committed/dispute-not-resolved crash boundary.
      const released =
        booking.status === 'PAID' &&
        booking.payment?.escrowStatus === 'RELEASED' &&
        (await tx.escrowLedger.findFirst({
          where: { bookingId: p.bookingId, entryType: 'RELEASE' },
        }));
      const tiers = released ? [] : await resolveDisputeRelease(tx, p.bookingId);
      await tx.dispute.update({
        where: { id: p.disputeId },
        data: { status: 'RESOLVED', resolution: p.resolution, resolvedById: p.adminId },
      });
      return tiers;
    }, TX);
    const b = await prisma.booking.findUnique({
      where: { id: p.bookingId },
      include: { usher: true, payment: true },
    });
    if (b?.payment) notifyPayoutReleased(b.usher.userId, kobo(b.payment.usherPayout));
    if (b) for (const tier of unlocked) notifyMilestoneUnlocked(b.usher.userId, tier.name);
  } else {
    // Refund the client — the booking is DISPUTED (frozen), already a legal
    // precursor to REFUNDED, so no status step is needed.
    const payment = await prisma.payment.findUnique({ where: { bookingId: p.bookingId } });
    const refund = await refundBookingToClient(
      { prisma, paystack },
      {
        bookingId: p.bookingId,
        amountKobo: payment?.grossAmount ?? 0,
        disputeResolution: { disputeId: p.disputeId, resolution: p.resolution, adminId: p.adminId },
      },
    );
    if (refund.status !== 'RECORDED') return false;
    // Older refund intents did not persist dispute metadata. Repair an already
    // settled refund on retry; new intents resolve both in the ledger transaction.
    await prisma.$transaction(async (tx) => {
      await lockBookingLifecycle(tx, p.bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: p.bookingId } });
      if (booking.status !== 'REFUNDED')
        throw new ApiError(409, 'REFUND_PENDING', 'refund has not settled');
      await tx.dispute.updateMany({
        where: { id: p.disputeId, bookingId: p.bookingId, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', resolution: p.resolution, resolvedById: p.adminId },
      });
    }, TX);
  }
  const parties = await loadBookingParties(p.bookingId);
  const payload = bookingEvent(p.bookingId, p.outcome === 'RELEASE' ? 'COMPLETED' : 'REFUNDED');
  realtime.emitToUser(parties.clientUserId, RT.BOOKING_DISPUTE_RESOLVED, payload);
  realtime.emitToUser(parties.usherUserId, RT.BOOKING_DISPUTE_RESOLVED, payload);
  realtime.emitToAdmins(RT.BOOKING_DISPUTE_RESOLVED, payload);
  return true;
}

async function executeRefund(
  p: { bookingId: string; amountKobo: number },
  paystack: PaystackPort,
): Promise<boolean> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: p.bookingId },
    include: { payment: true },
  });
  // Refunds are all-or-nothing per booking. Validate the amount BEFORE the
  // orchestrator (which reserves escrow before calling Paystack) so a partial amount can never fire
  // an external refund that the ledger then rejects.
  const held = booking.payment?.grossAmount ?? 0;
  if (p.amountKobo !== held) {
    throw new ApiError(
      400,
      'REFUND_MUST_BE_FULL',
      `refund must equal the booking's held amount (${held})`,
    );
  }
  // A still-CONFIRMED booking is cancelled first; one already CANCELLED/NO_SHOW/
  // DISPUTED goes straight to refund. The orchestrator issues the Paystack refund.
  const precursor = booking.status === 'CONFIRMED' ? ('CANCEL' as const) : undefined;
  const refund = await refundBookingToClient(
    { prisma, paystack },
    { bookingId: p.bookingId, amountKobo: p.amountKobo, precursor },
  );
  return refund.status === 'RECORDED';
}

export async function resolveDispute(
  adminId: string,
  disputeId: string,
  outcome: DisputeOutcome,
  resolution: string,
  paystack: PaystackPort,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ executed: boolean; approvalId?: string }> {
  const dispute = await prisma.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: { booking: { include: { payment: true } } },
  });
  if (dispute.status === 'RESOLVED')
    throw new ApiError(409, 'ALREADY_RESOLVED', 'dispute already resolved');
  const amount = dispute.booking.payment?.grossAmount ?? 0;

  if (amount > APPROVAL_THRESHOLD_KOBO) {
    const approval = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${disputeId}::uuid FOR UPDATE`;
      const current = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
      if (current.status !== 'OPEN')
        throw new ApiError(
          409,
          'CASE_NOT_OPEN',
          'This case already has a decision or a proposal under review.',
        );
      const proposal = await tx.approval.create({
        data: {
          kind: 'DISPUTE_RESOLVE',
          amountKobo: amount,
          makerId: adminId,
          payload: { disputeId, bookingId: dispute.bookingId, outcome, resolution },
        },
      });
      await tx.dispute.update({ where: { id: disputeId }, data: { status: 'UNDER_REVIEW' } });
      return proposal;
    }, TX);
    await writeAudit({
      actorId: adminId,
      action: 'dispute.resolve.proposed',
      target: disputeId,
      metadata: { outcome, amount },
    });
    return { executed: false, approvalId: approval.id };
  }

  const executed = await executeDisputeResolution(
    { bookingId: dispute.bookingId, outcome, disputeId, resolution, adminId },
    paystack,
    realtime,
  );
  await writeAudit({
    actorId: adminId,
    action: 'dispute.resolve',
    target: disputeId,
    metadata: { outcome },
  });
  return { executed };
}

export async function createRefund(
  adminId: string,
  bookingId: string,
  amountKobo: number,
  reason: string,
  paystack: PaystackPort,
): Promise<{ executed: boolean; approvalId?: string }> {
  if (amountKobo > APPROVAL_THRESHOLD_KOBO) {
    const approval = await prisma.$transaction(async (tx) => {
      await lockBookingLifecycle(tx, bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      await assertRefundable(
        tx,
        bookingId,
        amountKobo,
        booking.status === 'CONFIRMED' ? 'CANCEL' : undefined,
      );
      const existing = await tx.approval.findFirst({
        where: {
          kind: 'REFUND',
          status: { in: ['PENDING', 'APPROVED'] },
          payload: { path: ['bookingId'], equals: bookingId },
        },
      });
      if (existing) return existing;
      return tx.approval.create({
        data: {
          kind: 'REFUND',
          amountKobo,
          makerId: adminId,
          payload: { bookingId, amountKobo, reason },
        },
      });
    }, TX);
    await writeAudit({
      actorId: adminId,
      action: 'refund.proposed',
      target: bookingId,
      metadata: { amountKobo },
    });
    return { executed: false, approvalId: approval.id };
  }
  const executed = await executeRefund({ bookingId, amountKobo }, paystack);
  await writeAudit({
    actorId: adminId,
    action: 'refund',
    target: bookingId,
    metadata: { amountKobo, reason },
  });
  return { executed };
}

export async function decideApproval(
  checkerId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
  paystack: PaystackPort,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const a = await prisma.approval.findUniqueOrThrow({ where: { id: approvalId } });
  if (a.status !== 'PENDING') throw new ApiError(409, 'NOT_PENDING', 'approval already decided');
  if (a.makerId === checkerId)
    throw new ApiError(403, 'SAME_ADMIN', 'checker must differ from maker');

  if (decision === 'reject') {
    await prisma.$transaction(async (tx) => {
      const payload = a.payload as Record<string, unknown>;
      const disputeId =
        a.kind === 'DISPUTE_RESOLVE' && typeof payload.disputeId === 'string'
          ? payload.disputeId
          : null;
      if (disputeId)
        await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${disputeId}::uuid FOR UPDATE`;
      const claimed = await tx.approval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: { status: 'REJECTED', checkerId },
      });
      if (claimed.count === 0) throw new ApiError(409, 'NOT_PENDING', 'approval already decided');
      if (disputeId) {
        // Legacy cases may have multiple proposals. Only reopen after every
        // pending/approved proposal has ended; never undo a resolved case.
        const remaining = await tx.approval.count({
          where: {
            kind: 'DISPUTE_RESOLVE',
            status: { in: ['PENDING', 'APPROVED'] },
            payload: { path: ['disputeId'], equals: disputeId },
          },
        });
        if (!remaining)
          await tx.dispute.updateMany({
            where: { id: disputeId, status: 'UNDER_REVIEW' },
            data: { status: 'OPEN' },
          });
      }
    }, TX);
    await writeAudit({ actorId: checkerId, action: 'approval.reject', target: approvalId });
    return;
  }

  // The checker decision and its recovery intent commit together. EXECUTED is
  // reserved for completion of the actual money operation.
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.approval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: { status: 'APPROVED', checkerId },
    });
    if (claimed.count === 0) throw new ApiError(409, 'NOT_PENDING', 'approval already decided');
    await tx.paymentOperation.create({
      data: {
        kind: 'APPROVAL_EXECUTE',
        dedupeKey: `APPROVAL_EXECUTE:${approvalId}`,
        payload: { approvalId },
      },
    });
  }, TX);

  await executeApprovalOp(a, paystack, realtime);
  // Audit the checker decision; the durable operation records execution state.
  await writeAudit({ actorId: checkerId, action: 'approval.execute', target: approvalId });
}

/** Resume an approved action; local execution and nested refunds are independently idempotent. */
export async function executeApprovalOp(
  a: { id: string; kind: ApprovalKind; makerId: string; payload: unknown },
  paystack: PaystackPort,
  realtime: RealtimeGateway = noopGateway,
) {
  const current = await prisma.approval.findUniqueOrThrow({ where: { id: a.id } });
  if (!['APPROVED', 'EXECUTED'].includes(current.status) || !current.checkerId) {
    throw new ApiError(409, 'NOT_APPROVED', 'approval has not been authorized by a checker');
  }
  const payload = current.payload as Record<string, unknown>;
  const { op } = await claimOperation(prisma, {
    kind: 'APPROVAL_EXECUTE',
    dedupeKey: `APPROVAL_EXECUTE:${a.id}`,
    payload: { approvalId: a.id },
  });
  const execute = async () => {
    const done =
      current.kind === 'DISPUTE_RESOLVE'
        ? await executeDisputeResolution(
            {
              bookingId: String(payload.bookingId),
              outcome: payload.outcome as DisputeOutcome,
              disputeId: String(payload.disputeId),
              resolution: typeof payload.resolution === 'string' ? payload.resolution : '',
              adminId: current.checkerId ?? current.makerId,
            },
            paystack,
            realtime,
          )
        : await executeRefund(
            { bookingId: String(payload.bookingId), amountKobo: Number(payload.amountKobo) },
            paystack,
          );
    return { status: done ? ('success' as const) : ('pending' as const) };
  };
  return runOperation(prisma, op, {
    provider: execute,
    reconcile: execute,
    onSuccess: async (tx) => {
      await tx.approval.update({ where: { id: a.id }, data: { status: 'EXECUTED' } });
      return true;
    },
  });
}
