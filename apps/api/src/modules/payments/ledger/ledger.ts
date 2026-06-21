/**
 * The escrow + wallet ledger engine (TRD §6/§10/§25). This is the ONLY code
 * that writes escrow_ledger / wallet_ledger and mutates wallet balances. Each
 * function runs inside a caller-provided Prisma transaction and takes row locks
 * (SELECT … FOR UPDATE) so escrow and wallet stay atomic and concurrency-safe.
 */
import type { MilestoneTier, Prisma } from '@hq/database';
import { splitFee, PLATFORM_FEE_BPS, type AttendanceMethod } from '@hq/shared';
import {
  assertBookingTransition,
  assertOrderTransition,
  assertWithdrawalTransition,
} from '@hq/shared';
import { evaluateMilestones } from '../../rewards/service.js';

export class LedgerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

type Tx = Prisma.TransactionClient;

// --- locking helpers (Prisma has no native row-lock API; use raw FOR UPDATE) ---
async function lockBooking(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id}::uuid FOR UPDATE`;
}
async function lockOrder(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
}
async function lockWallet(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${id}::uuid FOR UPDATE`;
}

async function escrowBalance(tx: Tx, bookingId: string): Promise<number> {
  const agg = await tx.escrowLedger.aggregate({
    where: { bookingId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

async function appendEscrow(
  tx: Tx,
  bookingId: string | null,
  entryType: 'HOLD' | 'RELEASE' | 'REFUND' | 'FEE' | 'REVERSAL' | 'COMMISSION_SWEEP',
  amount: number,
  paystackRef?: string,
): Promise<void> {
  const prev = bookingId ? await escrowBalance(tx, bookingId) : 0;
  await tx.escrowLedger.create({
    data: { bookingId, entryType, amount, balanceAfter: prev + amount, paystackRef: paystackRef ?? null },
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
  const next = wallet.availableBalance + amount;
  if (next < 0) throw new LedgerError('NEGATIVE_WALLET', 'wallet balance cannot go negative');
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

/**
 * Charge confirmed: hold every booking in the order into escrow. Σ HOLD ==
 * order.grossAmount (invariant). Idempotency is the caller's responsibility.
 */
export async function holdOrder(tx: Tx, orderId: string, chargeRef: string): Promise<void> {
  await lockOrder(tx, orderId);
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { bookings: true },
  });
  assertOrderTransition(order.status, 'PAID');

  for (const b of order.bookings) {
    assertBookingTransition(b.status, 'CONFIRMED');
    const { fee, payout } = splitFee(b.amount as never, PLATFORM_FEE_BPS);
    await appendEscrow(tx, b.id, 'HOLD', b.amount, chargeRef);
    await tx.payment.upsert({
      where: { bookingId: b.id },
      update: { escrowStatus: 'HELD', paystackChargeRef: chargeRef },
      create: {
        bookingId: b.id,
        grossAmount: b.amount,
        platformFee: fee,
        usherPayout: payout,
        paystackChargeRef: chargeRef,
        escrowStatus: 'HELD',
      },
    });
    await tx.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
  }
  await tx.order.update({
    where: { id: orderId },
    data: { status: 'PAID', paystackChargeRef: chargeRef },
  });
}

/**
 * Completion (client-verified or AUTO): release the usher's payout into their
 * wallet and record the platform fee. After this the booking's escrow entries
 * sum to 0 (HOLD − RELEASE − FEE). Blocks if escrow is FROZEN (disputed).
 */
export async function releaseBooking(
  tx: Tx,
  bookingId: string,
  method: AttendanceMethod,
): Promise<MilestoneTier[]> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true, usher: { include: { wallet: true } } },
  });
  const payment = booking.payment;
  if (!payment) throw new LedgerError('NO_PAYMENT', 'booking has no payment');
  if (payment.escrowStatus === 'FROZEN') {
    throw new LedgerError('FROZEN', 'cannot release a frozen (disputed) booking');
  }
  if (payment.escrowStatus !== 'HELD') {
    throw new LedgerError('NOT_HELD', `escrow not HELD (is ${payment.escrowStatus})`);
  }
  const wallet = booking.usher.wallet;
  if (!wallet) throw new LedgerError('NO_WALLET', 'usher has no wallet');

  assertBookingTransition(booking.status, 'COMPLETED');
  await appendEscrow(tx, bookingId, 'RELEASE', -payment.usherPayout);
  await appendEscrow(tx, bookingId, 'FEE', -payment.platformFee);
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'RELEASED' } });
  await appendWallet(tx, wallet.id, 'CREDIT', payment.usherPayout, { bookingId });

  await tx.booking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED', completedAt: new Date(), attendanceMethod: method },
  });
  const unlocked = await evaluateMilestones(tx, booking.usherId);
  assertBookingTransition('COMPLETED', 'PAID');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'PAID' } });
  return unlocked;
}

/**
 * Admin dispute resolution in the usher's favour: unfreeze and release the
 * payout to the wallet (TRD §11/§15). REFUND-in-client's-favour reuses
 * refundBooking (DISPUTED → REFUNDED is already legal).
 */
export async function resolveDisputeRelease(tx: Tx, bookingId: string): Promise<MilestoneTier[]> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payment: true, usher: { include: { wallet: true } } },
  });
  if (booking.status !== 'DISPUTED') throw new LedgerError('NOT_DISPUTED', 'booking is not disputed');
  const payment = booking.payment;
  if (!payment) throw new LedgerError('NO_PAYMENT', 'booking has no payment');
  const wallet = booking.usher.wallet;
  if (!wallet) throw new LedgerError('NO_WALLET', 'usher has no wallet');

  assertBookingTransition('DISPUTED', 'COMPLETED');
  await appendEscrow(tx, bookingId, 'RELEASE', -payment.usherPayout);
  await appendEscrow(tx, bookingId, 'FEE', -payment.platformFee);
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'RELEASED' } });
  await appendWallet(tx, wallet.id, 'CREDIT', payment.usherPayout, { bookingId });
  await tx.booking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED', completedAt: new Date(), attendanceMethod: 'AUTO' },
  });
  const unlocked = await evaluateMilestones(tx, booking.usherId);
  assertBookingTransition('COMPLETED', 'PAID');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'PAID' } });
  return unlocked;
}

/** Move a confirmed booking to CANCELLED (precursor to a refund). */
export async function cancelBooking(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'CANCELLED');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
}

/** Flag a confirmed booking as NO_SHOW (precursor to a 100% client refund, §12). */
export async function markNoShow(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'NO_SHOW');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'NO_SHOW' } });
}

/** Promote a confirmed booking to CHECKED_IN (used by attendance + auto-complete). */
export async function markCheckedIn(
  tx: Tx,
  bookingId: string,
  method: AttendanceMethod,
): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'CHECKED_IN');
  await tx.booking.update({
    where: { id: bookingId },
    data: { status: 'CHECKED_IN', attendanceMethod: method, checkedInAt: new Date() },
  });
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
  if (amountKobo < 0) throw new LedgerError('BAD_AMOUNT', 'refund amount must be >= 0');

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
}

/** Freeze a booking's escrow when a dispute opens (blocks release/refund). */
export async function freezeBooking(tx: Tx, bookingId: string): Promise<void> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assertBookingTransition(booking.status, 'DISPUTED');
  await tx.booking.update({ where: { id: bookingId }, data: { status: 'DISPUTED' } });
  await tx.payment.update({ where: { bookingId }, data: { escrowStatus: 'FROZEN' } }).catch(() => {
    /* booking may not have a payment yet */
  });
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
  if (amountKobo <= 0) throw new LedgerError('BAD_AMOUNT', 'amount must be positive');
  if (wallet.availableBalance < amountKobo) {
    throw new LedgerError('INSUFFICIENT_FUNDS', 'insufficient wallet balance');
  }
  const withdrawal = await tx.withdrawal.create({
    data: { walletId, bankAccountId, amount: amountKobo, status: 'PROCESSING' },
  });
  await appendWallet(tx, walletId, 'DEBIT', -amountKobo, { withdrawalId: withdrawal.id });
  return withdrawal.id;
}

/** Transfer failed: keep funds in the wallet (REVERSAL), mark FAILED (§10). */
export async function failWithdrawal(tx: Tx, withdrawalId: string): Promise<void> {
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  assertWithdrawalTransition(w.status, 'FAILED');
  await appendWallet(tx, w.walletId, 'REVERSAL', w.amount, { withdrawalId });
  await tx.withdrawal.update({ where: { id: withdrawalId }, data: { status: 'FAILED' } });
}

/** Transfer succeeded: withdrawal PAID (funds already debited at request). */
export async function completeWithdrawal(
  tx: Tx,
  withdrawalId: string,
  transferRef: string,
): Promise<void> {
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  assertWithdrawalTransition(w.status, 'PAID');
  await tx.withdrawal.update({
    where: { id: withdrawalId },
    data: { status: 'PAID', paystackTransferRef: transferRef },
  });
}

/** Sweep accumulated platform fees out of the Balance to the operating bank (D3). */
export async function commissionSweep(tx: Tx, amountKobo: number): Promise<void> {
  if (amountKobo <= 0) throw new LedgerError('BAD_AMOUNT', 'sweep amount must be positive');
  await appendEscrow(tx, null, 'COMMISSION_SWEEP', -amountKobo);
}
