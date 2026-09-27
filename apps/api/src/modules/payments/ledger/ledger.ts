/**
 * The escrow + wallet ledger engine (TRD §6/§10/§25). This is the ONLY code
 * that writes escrow_ledger / wallet_ledger and mutates wallet balances. Each
 * function runs inside a caller-provided Prisma transaction and takes row locks
 * (SELECT … FOR UPDATE) so escrow and wallet stay atomic and concurrency-safe.
 */
import type { MilestoneTier, Prisma } from '@hq/database';
import {
  bookingAllocation,
  bookingReleaseAt,
  disputeWindowOpen,
  type AttendanceMethod,
} from '@hq/shared';
import {
  assertBookingTransition,
  assertOrderTransition,
  assertWithdrawalTransition,
} from '@hq/shared';
import {
  cancellationApproved,
  cancellationSnapshot,
  type CancellationSnapshot,
} from '../cancellation-policy.js';
import { writeAudit } from '../../audit.js';
import { evaluateMilestones } from '../../rewards/service.js';
import {
  lockBookingLifecycle,
  lockOrderLifecycle,
  refreshEventStaffing,
} from '../../events/staffing.js';

import {
  LedgerError,
  assertLedgerAmount,
  assertSignedLedgerAmount,
  checkedLedgerBalance,
  assertOrderAllocations,
  assertPaymentAllocation,
} from './amounts.js';
export { LedgerError } from './amounts.js';

type Tx = Prisma.TransactionClient;

// --- locking helpers (Prisma has no native row-lock API; use raw FOR UPDATE) ---
async function lockBooking(tx: Tx, id: string): Promise<void> {
  await lockBookingLifecycle(tx, id);
}
async function lockOrder(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
}
async function lockWallet(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${id}::uuid FOR UPDATE`;
}
async function lockWithdrawal(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM withdrawals WHERE id = ${id}::uuid FOR UPDATE`;
}

async function escrowBalance(tx: Tx, bookingId: string): Promise<number> {
  const agg = await tx.escrowLedger.aggregate({
    where: { bookingId },
    _sum: { amount: true },
  });
  const balance = agg._sum.amount ?? 0;
  assertLedgerAmount(balance, true);
  return balance;
}

async function appendEscrow(
  tx: Tx,
  bookingId: string | null,
  entryType: 'HOLD' | 'RELEASE' | 'REFUND' | 'FEE' | 'REVERSAL' | 'COMMISSION_SWEEP',
  amount: number,
  paystackRef?: string,
): Promise<void> {
  assertSignedLedgerAmount(amount);
  const prev = bookingId ? await escrowBalance(tx, bookingId) : 0;
  // Platform sweep rows have no booking: their balanceAfter is the signed
  // movement, not a cumulative platform balance. Keep reconciliation semantics.
  const balanceAfter = bookingId ? checkedLedgerBalance(prev, amount, 'escrow') : amount;
  await tx.escrowLedger.create({
    data: {
      bookingId,
      entryType,
      amount,
      balanceAfter,
      paystackRef: paystackRef ?? null,
    },
  });
}

async function appendWallet(
  tx: Tx,
  walletId: string,
  entryType: 'CREDIT' | 'DEBIT' | 'REVERSAL',
  amount: number,
  refs: { bookingId?: string; withdrawalId?: string } = {},
): Promise<number> {
  await lockWallet(tx, walletId); // re-entrant within a tx; guarantees the balance row is locked
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  const next = checkedLedgerBalance(wallet.availableBalance, amount, 'wallet');
  await tx.walletLedger.create({
    data: {
      walletId,
      entryType,
      amount,
      balanceAfter: next,
      bookingId: refs.bookingId ?? null,
      withdrawalId: refs.withdrawalId ?? null,
    },
  });
  await tx.wallet.update({ where: { id: walletId }, data: { availableBalance: next } });
  return next;
}

/** Caller holds the booking lock; an in-flight refund reserves the allocation. */
async function assertNoRefundReservation(tx: Tx, bookingId: string): Promise<void> {
  const op = await tx.paymentOperation.findUnique({
    where: { dedupeKey: `BOOKING_REFUND:${bookingId}` },
  });
  if (op && op.status !== 'FAILED')
    throw new LedgerError('REFUND_PENDING', 'booking is reserved for a refund');
}

/** Validate all refund preconditions while locking the allocation, before any external effect. */
export async function assertRefundable(
  tx: Tx,
  bookingId: string,
  amountKobo: number,
  precursor?: 'CANCEL' | 'NO_SHOW',
): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true, order: true },
  });
  assertLedgerAmount(amountKobo, true);
  if (booking.payment && !['HELD', 'FROZEN'].includes(booking.payment.escrowStatus)) {
    throw new LedgerError('NOT_REFUNDABLE', 'escrow is no longer refundable');
  }
  if (amountKobo !== (await escrowBalance(tx, bookingId)))
    throw new LedgerError('REFUND_MUST_BE_FULL', 'refund must equal held escrow');
  if (amountKobo > 0 && (!booking.payment || !booking.order?.paystackChargeRef))
    throw new LedgerError('NO_PAYMENT', 'refund requires a captured charge');
  const target =
    precursor === 'CANCEL' ? 'CANCELLED' : precursor === 'NO_SHOW' ? 'NO_SHOW' : booking.status;
  if (precursor) assertBookingTransition(booking.status, target);
  assertBookingTransition(target, 'REFUNDED');
  if (booking.order && !['PAID', 'PARTIALLY_REFUNDED'].includes(booking.order.status)) {
    throw new LedgerError('NOT_REFUNDABLE', 'order is not refundable');
  }
}

/** All allocation reads used for HOLD/expiry happen after event→order→booking locks. */
async function lockedOrderAllocations(tx: Tx, orderId: string) {
  await lockOrderLifecycle(tx, orderId);
  const identities = await tx.booking.findMany({
    where: { orderId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const booking of identities)
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id}::uuid FOR UPDATE`;
  return tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { bookings: { include: { payment: true }, orderBy: { id: 'asc' } } },
  });
}
type LockedOrder = Awaited<ReturnType<typeof lockedOrderAllocations>>;

async function assertNoOrderEscrow(tx: Tx, order: LockedOrder): Promise<void> {
  if (
    await tx.escrowLedger.count({ where: { bookingId: { in: order.bookings.map((b) => b.id) } } })
  )
    throw new LedgerError('EXISTING_ESCROW', 'order allocations already have ledger history');
}

/** Validate every row before the first HOLD/payment/status effect. */
async function preflightHold(
  tx: Tx,
  order: LockedOrder,
  chargeRef: string,
  expired: boolean,
): Promise<void> {
  assertOrderTransition(order.status, 'PAID');
  assertOrderAllocations(
    order.grossAmount,
    order.bookings.map((b) => b.amount),
  );
  if (!chargeRef || (order.paystackChargeRef && order.paystackChargeRef !== chargeRef))
    throw new LedgerError('CHARGE_REFERENCE_MISMATCH', 'charge reference does not match order');
  await assertNoOrderEscrow(tx, order);
  for (const booking of order.bookings) {
    const expected = bookingAllocation(booking.amount, booking.staffPay);
    if (booking.eventId !== order.eventId)
      throw new LedgerError('ALLOCATION_MISMATCH', 'booking allocation belongs to another event');
    if (expired) {
      if (booking.status !== 'CANCELLED')
        throw new LedgerError(
          'BAD_EXPIRY_STATE',
          'expired booking allocation must remain cancelled',
        );
      if (booking.payment)
        throw new LedgerError('EXISTING_PAYMENT', 'expired order already has a payment allocation');
    } else {
      assertBookingTransition(booking.status, 'CONFIRMED');
      if (booking.payment) {
        const payment = booking.payment;
        assertPaymentAllocation(booking.amount, payment);
        if (
          payment.escrowStatus !== 'HELD' ||
          payment.platformFee !== expected.fee ||
          payment.usherPayout !== expected.payout ||
          (payment.paystackChargeRef && payment.paystackChargeRef !== chargeRef) ||
          payment.paystackTransferRef
        )
          throw new LedgerError(
            'ALLOCATION_MISMATCH',
            'existing payment is incompatible with this charge',
          );
      }
    }
  }
}

async function recordOrderHold(
  tx: Tx,
  order: LockedOrder,
  chargeRef: string,
  confirmBookings: boolean,
): Promise<void> {
  for (const booking of order.bookings) {
    const { fee, payout } = bookingAllocation(booking.amount, booking.staffPay);
    await appendEscrow(tx, booking.id, 'HOLD', booking.amount, chargeRef);
    await tx.payment.upsert({
      where: { bookingId: booking.id },
      update: { escrowStatus: 'HELD', paystackChargeRef: chargeRef },
      create: {
        bookingId: booking.id,
        grossAmount: booking.amount,
        platformFee: fee,
        usherPayout: payout,
        paystackChargeRef: chargeRef,
        escrowStatus: 'HELD',
      },
    });
    if (confirmBookings)
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
  }
  await tx.order.update({
    where: { id: order.id },
    data: { status: 'PAID', paystackChargeRef: chargeRef },
  });
  await refreshEventStaffing(tx, order.eventId);
}

/** Charge confirmed: every allocation is checked under locks before Σ HOLD == gross is recorded. */
export async function holdOrder(tx: Tx, orderId: string, chargeRef: string): Promise<void> {
  const order = await lockedOrderAllocations(tx, orderId);
  await preflightHold(tx, order, chargeRef, false);
  await recordOrderHold(tx, order, chargeRef, true);
}

/** OVA135: free an expired unpaid reservation without creating or moving money. */
export async function expireUnpaidOrder(tx: Tx, orderId: string, now = new Date()): Promise<void> {
  const order = await lockedOrderAllocations(tx, orderId);
  const checkout = await tx.checkout.findUnique({ where: { orderId } });
  if (
    !checkout ||
    checkout.state !== 'EXPIRED' ||
    checkout.expiresAt > now ||
    order.status !== 'PENDING'
  )
    throw new LedgerError('BAD_EXPIRY_STATE', 'checkout must be expired and unpaid');
  await assertNoOrderEscrow(tx, order);
  for (const booking of order.bookings) {
    if (
      booking.eventId !== order.eventId ||
      booking.status !== 'PENDING_PAYMENT' ||
      booking.payment
    )
      throw new LedgerError('BAD_EXPIRY_STATE', 'only unpaid pending allocations can expire');
    assertBookingTransition(booking.status, 'CANCELLED');
  }
  for (const booking of order.bookings)
    await tx.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
  await refreshEventStaffing(tx, order.eventId);
}

/** OVA135: a late charge is a refundable liability, never renewed staffing. */
export async function holdExpiredOrderForRefund(
  tx: Tx,
  orderId: string,
  chargeRef: string,
): Promise<void> {
  const order = await lockedOrderAllocations(tx, orderId);
  const checkout = await tx.checkout.findUnique({ where: { orderId } });
  if (!checkout || checkout.state !== 'EXPIRED' || checkout.reference !== chargeRef)
    throw new LedgerError('BAD_EXPIRY_STATE', 'late charge must match an expired checkout');
  await preflightHold(tx, order, chargeRef, true);
  await recordOrderHold(tx, order, chargeRef, false);
}

/** Record completion without moving any money (approved PRD §13 hold policy). */
export async function completeBookingHeld(
  tx: Tx,
  bookingId: string,
  method: AttendanceMethod,
  now: Date = new Date(),
): Promise<void> {
  await lockBooking(tx, bookingId);
  await assertNoRefundReservation(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (booking.payment?.escrowStatus !== 'HELD')
    throw new LedgerError('NOT_HELD', 'completion requires held escrow');
  assertPaymentAllocation(booking.amount, booking.payment);
  if ((await escrowBalance(tx, bookingId)) !== booking.amount)
    throw new LedgerError('ALLOCATION_MISMATCH', 'held escrow does not equal booking gross');
  if (booking.status === 'COMPLETED') return;
  assertBookingTransition(booking.status, 'COMPLETED');
  await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      attendanceMethod: method,
    },
  });
  await refreshEventStaffing(tx, booking.eventId, now);
}

/** Release completed earnings only after the deadline, under the lifecycle lock. */
export async function releaseBooking(
  tx: Tx,
  bookingId: string,
  method: AttendanceMethod,
  now: Date = new Date(),
): Promise<MilestoneTier[]> {
  await lockBooking(tx, bookingId);
  await assertNoRefundReservation(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: true, payment: true, usher: { include: { wallet: true } } },
  });
  const payment = booking.payment;
  if (!payment) throw new LedgerError('NO_PAYMENT', 'booking has no payment');
  if (payment.escrowStatus === 'FROZEN')
    throw new LedgerError('FROZEN', 'cannot release disputed funds');
  if (payment.escrowStatus !== 'HELD') throw new LedgerError('NOT_HELD', 'escrow is not held');
  if (now.getTime() < bookingReleaseAt(booking.event.eventDate, booking.event.endTime).getTime())
    throw new LedgerError(
      'DISPUTE_WINDOW_OPEN',
      'earnings remain held until 72 hours after event end',
    );
  if (
    await tx.dispute.findFirst({ where: { bookingId, status: { in: ['OPEN', 'UNDER_REVIEW'] } } })
  )
    throw new LedgerError('FROZEN', 'an unresolved dispute blocks release');
  const wallet = booking.usher.wallet;
  if (!wallet) throw new LedgerError('NO_WALLET', 'usher has no wallet');
  assertPaymentAllocation(booking.amount, payment);
  if ((await escrowBalance(tx, bookingId)) !== payment.grossAmount)
    throw new LedgerError('ALLOCATION_MISMATCH', 'held escrow does not equal payment gross');
  // Preserve the internal attendance→release API for already-mature bookings.
  if (booking.status !== 'COMPLETED') await completeBookingHeld(tx, bookingId, method, now);
  assertBookingTransition('COMPLETED', 'PAID');
  await appendEscrow(tx, bookingId, 'RELEASE', -payment.usherPayout);
  await appendEscrow(tx, bookingId, 'FEE', -payment.platformFee);
  await appendWallet(tx, wallet.id, 'CREDIT', payment.usherPayout, { bookingId });
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'RELEASED' } });
  const unlocked = await evaluateMilestones(tx, booking.usherId);
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'PAID' } });
  await refreshEventStaffing(tx, booking.eventId, now);
  return unlocked;
}

/** Resolve in the usher's favour by restoring held completion, never bypassing time. */
export async function resolveDisputeRelease(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  await assertNoRefundReservation(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (booking.status !== 'DISPUTED' || booking.payment?.escrowStatus !== 'FROZEN')
    throw new LedgerError('NOT_DISPUTED', 'resolution requires disputed, frozen funds');
  assertPaymentAllocation(booking.amount, booking.payment);
  if ((await escrowBalance(tx, bookingId)) !== booking.amount)
    throw new LedgerError('ALLOCATION_MISMATCH', 'held escrow does not equal payment gross');
  assertBookingTransition('DISPUTED', 'COMPLETED');
  await tx.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      completedAt: booking.completedAt ?? new Date(),
      attendanceMethod: booking.attendanceMethod ?? 'AUTO',
    },
  });
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'HELD' } });
  await refreshEventStaffing(tx, booking.eventId);
}

/** Move a confirmed booking to CANCELLED (precursor to a refund). */
export async function cancelBooking(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'CANCELLED');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
  await refreshEventStaffing(tx, booking.eventId);
}

/** Flag a confirmed booking as NO_SHOW (precursor to a 100% client refund, §12). */
export async function markNoShow(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'NO_SHOW');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'NO_SHOW' } });
  await refreshEventStaffing(tx, booking.eventId);
}

/** Promote a confirmed booking to CHECKED_IN (used by attendance + auto-complete). */
export async function markCheckedIn(
  tx: Tx,
  bookingId: string,
  method: AttendanceMethod,
): Promise<void> {
  await lockBooking(tx, bookingId);
  await assertNoRefundReservation(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'CHECKED_IN');
  await tx.booking.update({
    where: { id: bookingId },
    data: { status: 'CHECKED_IN', attendanceMethod: method, checkedInAt: new Date() },
  });
  await refreshEventStaffing(tx, booking.eventId);
}

/**
 * Refund a booking's allocation to the client (partial-of-batch, P1-4). Other
 * bookings in the order are untouched; the order moves to PARTIALLY_REFUNDED or
 * REFUNDED. Booking must already be CANCELLED / NO_SHOW / DISPUTED.
 */
export async function refundBooking(tx: Tx, bookingId: string, amountKobo: number): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (booking.orderId) await lockOrder(tx, booking.orderId);
  assertLedgerAmount(amountKobo, true);

  // Only HELD (cancel/no-show) or FROZEN (dispute) escrow is refundable — never
  // money already RELEASED to the usher or a prior REFUND (TRD §25 invariant:
  // "refund of an already-refunded allocation" is rejected).
  if (
    booking.payment &&
    booking.payment.escrowStatus !== 'HELD' &&
    booking.payment.escrowStatus !== 'FROZEN'
  ) {
    throw new LedgerError(
      'NOT_REFUNDABLE',
      `escrow not refundable (is ${booking.payment.escrowStatus})`,
    );
  }
  // A per-booking refund is all-or-nothing: it must equal exactly what's still
  // held for this booking. Partial amounts would strand the remainder while the
  // booking/order is marked terminally REFUNDED (TRD §25: HELD + released +
  // refunded must reconcile to the charged amount). While HELD this equals the
  // booking allocation. Partial-of-batch is modelled as full refunds of the
  // individual bookings, not a partial refund of one.
  const held = await escrowBalance(tx, bookingId);
  if (amountKobo !== held) {
    throw new LedgerError(
      'REFUND_MUST_BE_FULL',
      `refund ${amountKobo} must equal the held balance ${held}`,
    );
  }

  // §23 Q4 (processing-fee on refund) integration point — INTENTIONALLY INACTIVE.
  // When DEDUCT_PROCESSING_FEE_ON_REFUND is settled and turned on, the client
  // refund here becomes refundWithFeeDeduction(amountKobo, REFUND_PROCESSING_FEE_BPS)
  // and the retained fee needs its own ledger entry plus a reconciliation-formula
  // update — do NOT just shrink the REFUND amount, or the Balance won't reconcile.
  assertBookingTransition(booking.status, 'REFUNDED');
  if (amountKobo > 0) await appendEscrow(tx, bookingId, 'REFUND', -amountKobo);
  if (booking.payment) {
    await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'REFUNDED' } });
  }
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'REFUNDED' } });

  if (booking.orderId) {
    const siblings = await tx.booking.findMany({ where: { orderId: booking.orderId } });
    const allRefunded = siblings.every((b) => b.status === 'REFUNDED');
    const order = await tx.order.findUniqueOrThrow({ where: { id: booking.orderId } });
    const next = allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    assertOrderTransition(order.status, next);
    await tx.order.update({ where: { id: booking.orderId }, data: { status: next } });
  }
  await refreshEventStaffing(tx, booking.eventId);
}

/** Validate the entire cancellation allocation before reserving or dispatching a refund. */
export async function assertCancellationSettlement(
  tx: Tx,
  bookingId: string,
  raw: CancellationSnapshot,
): Promise<void> {
  const p = cancellationSnapshot(raw);
  await lockBooking(tx, bookingId);
  const b = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      payment: true,
      event: { include: { client: true } },
      usher: { include: { wallet: true } },
    },
  });
  if (
    b.event.client.userId !== p.clientUserId ||
    b.amount !== p.grossAmount ||
    (b.staffPay ?? null) !== (p.staffPay ?? null) ||
    b.payment?.escrowStatus !== 'HELD'
  )
    throw new LedgerError('INVALID_CANCELLATION', 'cancellation does not match the held booking');
  await assertRefundable(tx, bookingId, p.grossAmount, 'CANCEL');
  assertPaymentAllocation(b.amount, b.payment);
  if (p.usherPayoutKobo > 0) {
    if (!b.usher.wallet) throw new LedgerError('NO_WALLET', 'usher has no wallet');
    checkedLedgerBalance(b.usher.wallet.availableBalance, p.usherPayoutKobo, 'wallet');
  }
}

/** Provider-confirmed cancellation settlement, append-only and atomic with its intent. */
export async function settleClientCancellation(
  tx: Tx,
  bookingId: string,
  operationId: string,
  raw: CancellationSnapshot,
): Promise<void> {
  const p = cancellationSnapshot(raw);
  await assertCancellationSettlement(tx, bookingId, p);
  const op = await tx.paymentOperation.findUniqueOrThrow({ where: { id: operationId } });
  const payload = op.payload as { cancellation?: unknown; amountKobo?: unknown };
  if (
    op.kind !== 'BOOKING_REFUND' ||
    op.dedupeKey !== `BOOKING_REFUND:${bookingId}` ||
    op.status !== 'PROVIDER_OK' ||
    payload.amountKobo !== p.refundKobo ||
    JSON.stringify(cancellationSnapshot(payload.cancellation)) !== JSON.stringify(p)
  )
    throw new LedgerError(
      'INVALID_CANCELLATION',
      'settlement requires its confirmed cancellation intent',
    );
  if (!(await cancellationApproved(tx, operationId, p.grossAmount)))
    throw new LedgerError(
      'APPROVAL_REQUIRED',
      'cancellation requires two distinct admin approvals',
    );
  const b = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { usher: { include: { wallet: true } } },
  });
  await cancelBooking(tx, bookingId);
  if (p.usherCompensationKobo === 0) {
    await refundBooking(tx, bookingId, p.refundKobo);
  } else {
    if (p.refundKobo > 0) await appendEscrow(tx, bookingId, 'REFUND', -p.refundKobo);
    if (p.usherPayoutKobo > 0) {
      await appendEscrow(tx, bookingId, 'RELEASE', -p.usherPayoutKobo);
      await appendWallet(tx, b.usher.wallet!.id, 'CREDIT', p.usherPayoutKobo, { bookingId });
    }
    if (p.platformFeeKobo > 0) await appendEscrow(tx, bookingId, 'FEE', -p.platformFeeKobo);
    await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'RELEASED' } });
    if (p.refundKobo > 0 && b.orderId) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: b.orderId } });
      assertOrderTransition(order.status, 'PARTIALLY_REFUNDED');
      await tx.order.update({ where: { id: b.orderId }, data: { status: 'PARTIALLY_REFUNDED' } });
    }
  }
  if ((await escrowBalance(tx, bookingId)) !== 0)
    throw new LedgerError(
      'ALLOCATION_MISMATCH',
      'cancellation must consume exactly its held allocation',
    );
  await tx.paymentOperation.update({
    where: { id: operationId },
    data: { quarantinedAt: null, nextAttemptAt: null },
  });
  await writeAudit(
    {
      actorId: p.clientUserId,
      action: 'booking.cancellation.settled',
      target: bookingId,
      metadata: { operationId, ...p },
    },
    tx,
  );
}

/** Freeze a booking's escrow when a dispute opens (blocks release/refund). */
export async function freezeBooking(tx: Tx, bookingId: string, now?: Date): Promise<void> {
  await lockBooking(tx, bookingId);
  await assertNoRefundReservation(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true, event: true },
  });
  // Money-safety gate: a dispute may only be opened while the booking's funds are
  // still escrowed (HELD). Disputing after payout (RELEASED) would let resolution
  // re-credit the usher or fire an unrecorded Paystack refund. This is stricter
  // than the state table and is the authoritative guard.
  if (booking.payment?.escrowStatus !== 'HELD') {
    throw new LedgerError(
      'NOT_DISPUTABLE',
      'a dispute can only be opened while funds are in escrow',
    );
  }
  if (!disputeWindowOpen(booking.event.eventDate, booking.event.endTime, now ?? new Date()))
    throw new LedgerError('DISPUTE_WINDOW_CLOSED', 'the 72-hour dispute window has closed');
  assertBookingTransition(booking.status, 'DISPUTED');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'DISPUTED' } });
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'FROZEN' } });
  await refreshEventStaffing(tx, booking.eventId);
}

/** Usher requests a withdrawal: debit the wallet now; the bank transfer fires next (Phase 2). */
export async function requestWithdrawal(
  tx: Tx,
  walletId: string,
  bankAccountId: string,
  amountKobo: number,
): Promise<string> {
  await lockWallet(tx, walletId);
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  assertLedgerAmount(amountKobo);
  assertLedgerAmount(wallet.availableBalance, true);
  if (wallet.availableBalance < amountKobo) {
    throw new LedgerError('INSUFFICIENT_FUNDS', 'insufficient wallet balance');
  }
  const withdrawal = await tx.withdrawal.create({
    data: { walletId, bankAccountId, amount: amountKobo, status: 'PROCESSING' },
  });
  await appendWallet(tx, walletId, 'DEBIT', -amountKobo, { withdrawalId: withdrawal.id });
  return withdrawal.id;
}

/**
 * Transfer failed or reversed: re-credit the wallet (REVERSAL) and mark FAILED
 * (§10). Locks the withdrawal + wallet and re-reads under the lock so a
 * `transfer.failed`/`transfer.reversed` racing or following a `transfer.success`
 * settles to exactly one terminal state and the REVERSAL is applied at most once
 * (already-FAILED is a no-op). Returns whether this call applied the transition.
 */
export async function failWithdrawal(tx: Tx, withdrawalId: string): Promise<boolean> {
  await lockWithdrawal(tx, withdrawalId);
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (w.status === 'FAILED') return false; // reversal already applied — ignore duplicate
  assertLedgerAmount(w.amount);
  assertWithdrawalTransition(w.status, 'FAILED'); // PROCESSING→FAILED or PAID→FAILED (reversed)
  await appendWallet(tx, w.walletId, 'REVERSAL', w.amount, { withdrawalId });
  await tx.withdrawal.update({ where: { id: withdrawalId }, data: { status: 'FAILED' } });
  return true;
}

/**
 * Transfer succeeded: withdrawal PAID (funds already debited at request). Locks
 * the withdrawal and re-reads under the lock so a duplicate/replayed
 * `transfer.success` (or one racing a failure) settles exactly once. A success
 * arriving after a terminal FAILED is ignored (audited by the caller) rather
 * than re-paying. Returns whether this call applied the transition.
 */
export async function completeWithdrawal(
  tx: Tx,
  withdrawalId: string,
  transferRef: string,
): Promise<boolean> {
  await lockWithdrawal(tx, withdrawalId);
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  if (w.status === 'PAID' || w.status === 'FAILED') return false; // already terminal
  assertLedgerAmount(w.amount);
  assertWithdrawalTransition(w.status, 'PAID');
  await tx.withdrawal.update({
    where: { id: withdrawalId },
    data: { status: 'PAID', paystackTransferRef: transferRef },
  });
  return true;
}

/** Sweep accumulated platform fees out of the Balance to the operating bank (D3). */
export async function commissionSweep(tx: Tx, amountKobo: number): Promise<void> {
  assertLedgerAmount(amountKobo);
  await appendEscrow(tx, null, 'COMMISSION_SWEEP', -amountKobo);
}

/** Provider returned a recorded sweep: append the opposite signed movement. */
export async function reverseCommissionSweep(tx: Tx, amountKobo: number): Promise<void> {
  assertLedgerAmount(amountKobo);
  // Same entry type keeps the reconciliation formula and available-fee aggregate
  // correct. The caller locks the original operation and compensates it once.
  await appendEscrow(tx, null, 'COMMISSION_SWEEP', amountKobo);
}
