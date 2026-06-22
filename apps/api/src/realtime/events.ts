/**
 * Realtime event catalogue (TRD §4). Event names + payload shapes shared by the
 * gateway emit sites and (future) mobile/admin clients, so every surface agrees
 * on the wire format. Lifecycle pushes are *convenience* signals — the ledger
 * and DB remain the source of truth; a client that missed an event re-fetches.
 */

export const RT = {
  // Booking lifecycle (→ both parties; check-in/no-show/dispute also → admin feed).
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CHECKED_IN: 'booking.checked_in',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_PAID: 'booking.paid',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_NO_SHOW: 'booking.no_show',
  BOOKING_DISPUTED: 'booking.disputed',
  BOOKING_DISPUTE_RESOLVED: 'booking.dispute_resolved',
  ORDER_PAID: 'order.paid',
  // Withdrawals (→ the usher who owns the wallet).
  WITHDRAWAL_REQUESTED: 'withdrawal.requested',
  WITHDRAWAL_COMPLETED: 'withdrawal.completed',
  WITHDRAWAL_FAILED: 'withdrawal.failed',
  // Chat.
  MESSAGE_NEW: 'message:new',
  MESSAGE_SEEN: 'message:seen',
  TYPING: 'typing',
  CONVERSATION_UNREAD: 'conversation.unread',
} as const;

export type RealtimeEvent = (typeof RT)[keyof typeof RT];

/** A booking lifecycle transition. `status` is the new BookingStatus. */
export interface BookingEventPayload {
  bookingId: string;
  status: string;
  at: string; // ISO-8601, stamped at emit time
}

/** A withdrawal/payout status change. `status` is the new WithdrawalStatus. */
export interface WithdrawalEventPayload {
  withdrawalId: string;
  status: string;
  amountKobo?: number;
  at: string;
}

/** Emitted to a recipient's user room so the inbox badge updates off-thread. */
export interface ConversationUnreadPayload {
  bookingId: string;
  from: string; // sender userId
}

/** Helpers to stamp payloads consistently at emit time. */
export function bookingEvent(bookingId: string, status: string): BookingEventPayload {
  return { bookingId, status, at: new Date().toISOString() };
}
export function withdrawalEvent(
  withdrawalId: string,
  status: string,
  amountKobo?: number,
): WithdrawalEventPayload {
  return { withdrawalId, status, ...(amountKobo === undefined ? {} : { amountKobo }), at: new Date().toISOString() };
}
