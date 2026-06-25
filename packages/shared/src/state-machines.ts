/**
 * Authoritative state-machine transition tables (TRD §6/§12/§25). The ledger
 * and API enforce these; illegal transitions throw. Kept as data so tests can
 * exhaustively check every (from, to) pair.
 */
import type { BookingStatus, MilestoneStatus, OrderStatus, WithdrawalStatus } from './enums.js';

export class IllegalTransition extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Illegal ${entity} transition: ${from} → ${to}`);
    this.name = 'IllegalTransition';
  }
}

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'DISPUTED'],
  CHECKED_IN: ['COMPLETED', 'DISPUTED'],
  // Disputes are only permitted while funds are still escrowed. Post-payout
  // dispute (PAID/COMPLETED → DISPUTED) is temporarily forbidden until wallet
  // clawback/debt is modelled — otherwise resolution double-pays or funds an
  // unrecorded refund. (Reinstate with a clawback path.)
  COMPLETED: ['PAID'],
  PAID: [],
  DISPUTED: ['COMPLETED', 'REFUNDED', 'CANCELLED'], // admin resolution targets
  CANCELLED: ['REFUNDED'],
  NO_SHOW: ['REFUNDED'],
  REFUNDED: [],
};

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
};

export const WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, readonly WithdrawalStatus[]> = {
  REQUESTED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['PAID', 'FAILED'],
  // PAID → FAILED covers a `transfer.reversed`: the payout bounced back to the
  // Balance after success, so the wallet is re-credited (REVERSAL) once and the
  // withdrawal moves to FAILED. The reversal is idempotent — FAILED is terminal,
  // so a replayed/duplicate reversal is a no-op.
  PAID: ['FAILED'],
  FAILED: [], // retry creates a fresh withdrawal; FAILED is terminal
};

export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, readonly MilestoneStatus[]> = {
  UNLOCKED: ['FULFILLED'],
  FULFILLED: [], // terminal — reward delivered
};

function canTransitionIn<T extends string>(
  table: Record<T, readonly T[]>,
  from: T,
  to: T,
): boolean {
  return table[from].includes(to);
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return canTransitionIn(BOOKING_TRANSITIONS, from, to);
}
export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return canTransitionIn(ORDER_TRANSITIONS, from, to);
}
export function canTransitionWithdrawal(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  return canTransitionIn(WITHDRAWAL_TRANSITIONS, from, to);
}
export function canTransitionMilestone(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return canTransitionIn(MILESTONE_TRANSITIONS, from, to);
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) throw new IllegalTransition('booking', from, to);
}
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) throw new IllegalTransition('order', from, to);
}
export function assertWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus): void {
  if (!canTransitionWithdrawal(from, to)) throw new IllegalTransition('withdrawal', from, to);
}
export function assertMilestoneTransition(from: MilestoneStatus, to: MilestoneStatus): void {
  if (!canTransitionMilestone(from, to)) throw new IllegalTransition('milestone', from, to);
}

/**
 * UX label → DB enum map (UXRD §9). `In Progress` is display-only with no
 * stored booking value; everything else maps 1:1.
 */
export const BOOKING_LABEL_TO_STATUS: Record<string, BookingStatus | null> = {
  Booked: 'CONFIRMED',
  'Checked In': 'CHECKED_IN',
  'In Progress': null,
  Completed: 'COMPLETED',
  Paid: 'PAID',
  Cancelled: 'CANCELLED',
  'No-Show': 'NO_SHOW',
  Disputed: 'DISPUTED',
  Refunded: 'REFUNDED',
};
