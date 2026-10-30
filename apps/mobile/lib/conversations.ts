import type { Booking } from './types.js';

const CHATTABLE = new Set([
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'PAID',
  'DISPUTED',
  'CANCELLED',
  'REFUNDED',
  'NO_SHOW',
]);

export function conversationTitle(booking: Booking, isUsher: boolean): string {
  const counterparty = isUsher
    ? booking.event?.client?.displayName
    : (booking.usher?.displayName ?? booking.usher?.user?.phone);
  return counterparty ?? booking.event?.title ?? `Booking · ${booking.id.slice(0, 6)}`;
}

/** Both inbox filters operate on actual booking chats, never sample conversations. */
export function filterConversations(
  bookings: Booking[],
  isUsher: boolean,
  unreadOnly: boolean,
  search: string,
): Booking[] {
  const query = search.trim().toLocaleLowerCase();
  return bookings.filter(
    (booking) =>
      CHATTABLE.has(booking.status) &&
      (!unreadOnly || (booking.unreadCount ?? 0) > 0) &&
      (!query ||
        `${conversationTitle(booking, isUsher)} ${booking.event?.title ?? ''}`
          .toLocaleLowerCase()
          .includes(query)),
  );
}
