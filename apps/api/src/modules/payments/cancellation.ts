/** Client confirmation creates one immutable cancellation reservation, including its original time. */
import {
  bookingReleaseAt,
  cancelWindow,
  cancellationSettlement,
  eventInstant,
  MONEY_APPROVAL_THRESHOLD_KOBO,
  policyForCancellation,
  type CancellationSummary,
  type CancelBookingInput,
} from '@hq/shared';
import type { PaymentOperation } from '@hq/database';
import { ApiError } from '../../app.js';
import { lockBookingLifecycle } from '../events/staffing.js';
import { writeAudit } from '../audit.js';
import { assertCancellationSettlement } from './ledger/ledger.js';
import { cancellationApproved, cancellationSnapshot } from './cancellation-policy.js';
import { driveRefund, type Deps, type RefundPayload } from './service.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
export async function cancelConfirmedBooking(
  deps: Deps,
  bookingId: string,
  clientUserId: string,
  confirmation: CancelBookingInput = {},
) {
  const op = await deps.prisma.$transaction(async (tx) => {
    await lockBookingLifecycle(tx, bookingId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        event: { include: { client: true } },
        order: true,
      },
    });
    if (booking.event.client.userId !== clientUserId)
      throw new ApiError(403, 'FORBIDDEN', 'not your booking');
    const existing = await tx.paymentOperation.findUnique({
      where: { dedupeKey: `BOOKING_REFUND:${bookingId}` },
    });
    if (existing) {
      const p = existing.payload as unknown as RefundPayload;
      if (!p.cancellation || cancellationSnapshot(p.cancellation).clientUserId !== clientUserId)
        throw new ApiError(409, 'REFUND_CONFLICT', 'another refund already reserves this booking');
      return existing;
    }
    if (booking.status !== 'CONFIRMED')
      throw new ApiError(409, 'NOT_CONFIRMED', 'only confirmed bookings can be cancelled');
    const now = new Date();
    const start = eventInstant(booking.event.eventDate, booking.event.startTime);
    const window = cancelWindow(start, now);
    const amounts = cancellationSettlement(
      booking.amount,
      policyForCancellation('CLIENT', window),
      booking.staffPay,
    );
    // Old clients can safely request only their existing full-refund path. A late
    // split requires confirmation of the actual preview, and stale quotes are rejected.
    if (
      (confirmation.expectedWindow === undefined ||
        confirmation.expectedRefundKobo === undefined) &&
      window !== 'GT_48H'
    )
      throw new ApiError(
        409,
        'CANCELLATION_QUOTE_REQUIRED',
        'review the cancellation amounts before confirming',
      );
    if (
      (confirmation.expectedWindow !== undefined && confirmation.expectedWindow !== window) ||
      (confirmation.expectedRefundKobo !== undefined &&
        confirmation.expectedRefundKobo !== amounts.refundKobo)
    )
      throw new ApiError(
        409,
        'CANCELLATION_QUOTE_CHANGED',
        'the cancellation amounts changed; review the updated quote',
      );
    const snapshot = cancellationSnapshot({
      policy: booking.staffPay == null ? 'CLIENT_CANCEL_V1' : 'CLIENT_CANCEL_V2',
      ...(booking.staffPay == null ? {} : { staffPay: booking.staffPay }),
      clientUserId,
      requestedAt: now.toISOString(),
      eventStart: start.toISOString(),
      window,
      grossAmount: booking.amount,
      ...amounts,
    });
    await assertCancellationSettlement(tx, bookingId, snapshot);
    const requiresApproval = snapshot.grossAmount > MONEY_APPROVAL_THRESHOLD_KOBO;
    const operation = await tx.paymentOperation.create({
      data: {
        kind: 'BOOKING_REFUND',
        dedupeKey: `BOOKING_REFUND:${bookingId}`,
        payload: {
          bookingId,
          amountKobo: amounts.refundKobo,
          precursor: 'CANCEL',
          chargeReference: booking.order?.paystackChargeRef ?? null,
          cancellation: snapshot,
        },
        // Manual review holds are excluded from automatic scheduling; the checker
        // creates a durable APPROVAL_EXECUTE job. Dispatch independently checks approval.
        ...(requiresApproval
          ? { quarantinedAt: now, lastError: 'Cancellation awaiting two-admin approval' }
          : {}),
      },
    });
    await writeAudit(
      {
        actorId: clientUserId,
        action: 'booking.cancellation.requested',
        target: bookingId,
        metadata: {
          operationId: operation.id,
          ...snapshot,
          requiresApproval,
          ...(confirmation.reason ? { reason: confirmation.reason } : {}),
        },
      },
      tx,
    );
    return operation;
  }, TX);
  const p = cancellationSnapshot((op.payload as unknown as RefundPayload).cancellation);
  if (op.status === 'FAILED')
    throw new ApiError(
      409,
      'CANCELLATION_FAILED',
      'the refund failed; contact support to review this cancellation',
    );
  // A settled receipt remains terminal even if an approver's role later changes.
  const approved =
    op.status === 'RECORDED' || (await cancellationApproved(deps.prisma, op.id, p.grossAmount));
  const result = approved ? await driveRefund(deps, op) : { status: 'PENDING' as const };
  const status =
    result.status === 'RECORDED'
      ? 'RECORDED'
      : result.status === 'FAILED'
        ? 'FAILED'
        : approved
          ? 'PROCESSING'
          : 'AWAITING_APPROVAL';
  return {
    status,
    operationId: op.id,
    outcome: policyForCancellation('CLIENT', p.window),
    settlement: p,
  };
}

/** Safe read model: never expose the provider charge reference or admin identities. */
export async function cancellationView(
  db: Pick<Deps['prisma'], 'approval'>,
  operation: Pick<PaymentOperation, 'id' | 'payload' | 'status'> | null,
): Promise<CancellationSummary | null> {
  const payload = operation?.payload as unknown as RefundPayload | undefined;
  if (!operation || !payload?.cancellation) return null;
  const p = cancellationSnapshot(payload.cancellation);
  const approved = await cancellationApproved(db, operation.id, p.grossAmount);
  return {
    operationId: operation.id,
    status:
      operation.status === 'RECORDED'
        ? 'RECORDED'
        : operation.status === 'FAILED'
          ? 'FAILED'
          : approved
            ? 'PROCESSING'
            : 'AWAITING_APPROVAL',
    requestedAt: p.requestedAt,
    window: p.window,
    refundKobo: p.refundKobo,
    usherCompensationKobo: p.usherCompensationKobo,
    platformFeeKobo: p.platformFeeKobo,
    usherPayoutKobo: p.usherPayoutKobo,
    processingFeeKobo: p.processingFeeKobo,
    requiresApproval: p.grossAmount > MONEY_APPROVAL_THRESHOLD_KOBO,
  };
}

export function releaseInformation(event: { eventDate: Date; endTime: string }) {
  return { payoutAvailableAt: bookingReleaseAt(event.eventDate, event.endTime).toISOString() };
}
