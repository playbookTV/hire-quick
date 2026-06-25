/**
 * Admin money actions with maker-checker (TRD §15). A money move above the
 * threshold creates a PENDING Approval (maker); a *different* admin (checker)
 * approves to execute. Below the threshold it executes immediately. Every step
 * is audit-logged.
 */
import { prisma, type ApprovalKind } from '@hq/database';
import { ApiError } from '../../app.js';
import { resolveDisputeRelease } from '../payments/ledger/ledger.js';
import { claimOperation, runOperation } from '../payments/ledger/operations.js';
import { refundBookingToClient } from '../payments/service.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { notifyPayoutReleased, notifyMilestoneUnlocked } from '../notifications/service.js';
import { kobo } from '@hq/shared';
import { writeAudit } from '../audit.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { RT, bookingEvent } from '../../realtime/events.js';
import { loadBookingParties } from '../../realtime/messages.js';

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
): Promise<void> {
  if (p.outcome === 'RELEASE') {
    const unlocked = await prisma.$transaction((tx) => resolveDisputeRelease(tx, p.bookingId), TX);
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
    await refundBookingToClient({ prisma, paystack }, { bookingId: p.bookingId, amountKobo: payment?.grossAmount ?? 0 });
  }
  await prisma.dispute.update({
    where: { id: p.disputeId },
    data: { status: 'RESOLVED', resolution: p.resolution, resolvedById: p.adminId },
  });
  const parties = await loadBookingParties(p.bookingId);
  const payload = bookingEvent(p.bookingId, p.outcome === 'RELEASE' ? 'COMPLETED' : 'REFUNDED');
  realtime.emitToUser(parties.clientUserId, RT.BOOKING_DISPUTE_RESOLVED, payload);
  realtime.emitToUser(parties.usherUserId, RT.BOOKING_DISPUTE_RESOLVED, payload);
  realtime.emitToAdmins(RT.BOOKING_DISPUTE_RESOLVED, payload);
}

async function executeRefund(p: { bookingId: string; amountKobo: number }, paystack: PaystackPort): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: p.bookingId },
    include: { payment: true },
  });
  // Refunds are all-or-nothing per booking. Validate the amount BEFORE the
  // orchestrator (which calls Paystack first) so a partial amount can never fire
  // an external refund that the ledger then rejects.
  const held = booking.payment?.grossAmount ?? 0;
  if (p.amountKobo !== held) {
    throw new ApiError(400, 'REFUND_MUST_BE_FULL', `refund must equal the booking's held amount (${held})`);
  }
  // A still-CONFIRMED booking is cancelled first; one already CANCELLED/NO_SHOW/
  // DISPUTED goes straight to refund. The orchestrator issues the Paystack refund.
  const precursor = booking.status === 'CONFIRMED' ? ('CANCEL' as const) : undefined;
  await refundBookingToClient({ prisma, paystack }, { bookingId: p.bookingId, amountKobo: p.amountKobo, precursor });
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

  await executeDisputeResolution({ bookingId: dispute.bookingId, outcome, disputeId, resolution, adminId }, paystack, realtime);
  await writeAudit({ actorId: adminId, action: 'dispute.resolve', target: disputeId, metadata: { outcome } });
  return { executed: true };
}

export async function createRefund(
  adminId: string,
  bookingId: string,
  amountKobo: number,
  reason: string,
  paystack: PaystackPort,
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
  await executeRefund({ bookingId, amountKobo }, paystack);
  await writeAudit({ actorId: adminId, action: 'refund', target: bookingId, metadata: { amountKobo, reason } });
  return { executed: true };
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
  if (a.makerId === checkerId) throw new ApiError(403, 'SAME_ADMIN', 'checker must differ from maker');

  if (decision === 'reject') {
    // Atomic claim: only the first checker flips PENDING → REJECTED.
    const claimed = await prisma.approval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: { status: 'REJECTED', checkerId },
    });
    if (claimed.count === 0) throw new ApiError(409, 'NOT_PENDING', 'approval already decided');
    await writeAudit({ actorId: checkerId, action: 'approval.reject', target: approvalId });
    return;
  }

  // Atomic claim BEFORE executing: two checkers reading PENDING concurrently
  // would otherwise both run the external refund. The conditional update is the
  // serialization point — exactly one wins (count === 1); the loser gets 409 and
  // never touches Paystack.
  const claimed = await prisma.approval.updateMany({
    where: { id: approvalId, status: 'PENDING' },
    data: { status: 'EXECUTED', checkerId },
  });
  if (claimed.count === 0) throw new ApiError(409, 'NOT_PENDING', 'approval already decided');

  await executeApprovalOp(a, paystack, realtime);
  // Status was already claimed EXECUTED above; just record the audit trail.
  await writeAudit({ actorId: checkerId, action: 'approval.execute', target: approvalId });
}

/**
 * Run a claimed approval's money move through a durable APPROVAL_EXECUTE op.
 * Shared by decideApproval (first run) and the recovery job (resume after a
 * crash between the EXECUTED claim and the money move). Idempotent: refunds flow
 * through the durable BOOKING_REFUND op and dispute release is status-guarded, so
 * a resumed re-run never double-pays.
 */
export async function executeApprovalOp(
  a: { id: string; kind: ApprovalKind; makerId: string; payload: unknown },
  paystack: PaystackPort,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const payload = a.payload as Record<string, unknown>;
  const { op } = await claimOperation(prisma, {
    kind: 'APPROVAL_EXECUTE',
    dedupeKey: `APPROVAL_EXECUTE:${a.id}`,
    payload: { approvalId: a.id },
  });
  await runOperation(prisma, op, {
    provider: async () => {
      if (a.kind === 'DISPUTE_RESOLVE') {
        await executeDisputeResolution({
          bookingId: String(payload.bookingId),
          outcome: payload.outcome as DisputeOutcome,
          disputeId: String(payload.disputeId),
          resolution: typeof payload.resolution === 'string' ? payload.resolution : '',
          adminId: a.makerId,
        }, paystack, realtime);
      } else {
        await executeRefund({ bookingId: String(payload.bookingId), amountKobo: Number(payload.amountKobo) }, paystack);
      }
      return { ok: true };
    },
    onSuccess: () => Promise.resolve(true),
  });
}
