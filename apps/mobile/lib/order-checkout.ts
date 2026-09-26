import { checkoutResponseSchema, type CheckoutResponse } from '@hq/shared';
import type { Booking } from './types.js';

/** A server order is recoverable without an intent stored on this device. */
export function readOrderOutcome(orderId: string, raw: unknown): CheckoutResponse {
  const outcome = checkoutResponseSchema.parse(raw);
  if (outcome.orderId !== orderId)
    throw new Error('The payment response belongs to another order.');
  return outcome;
}

export function validateOrderRoster(outcome: CheckoutResponse, bookings: Booking[]): Booking[] {
  const ids = new Set(outcome.bookingIds);
  if (
    ids.size === 0 ||
    ids.size !== outcome.bookingIds.length ||
    bookings.length !== ids.size ||
    new Set(bookings.map((b) => b.id)).size !== ids.size ||
    bookings.some(
      (b) =>
        !ids.has(b.id) ||
        b.eventId !== outcome.eventId ||
        b.orderId !== outcome.orderId ||
        !b.usher?.displayName?.trim() ||
        !Number.isSafeInteger(b.amount) ||
        b.amount < 0,
    ) ||
    bookings.reduce((sum, b) => sum + b.amount, 0) !== outcome.amountKobo
  )
    throw new Error('We couldn’t confirm every person and amount in this order. Please try again.');
  return bookings;
}

export async function loadOrderSummary(
  orderId: string,
  get: (path: string) => Promise<unknown>,
): Promise<{ checkout: CheckoutResponse; bookings: Booking[] }> {
  const checkout = readOrderOutcome(orderId, await get(`/api/payments/orders/${orderId}/checkout`));
  const bookings = await Promise.all(
    checkout.bookingIds.map(async (id) => (await get(`/api/bookings/${id}`)) as Booking),
  );
  return { checkout, bookings: validateOrderRoster(checkout, bookings) };
}
