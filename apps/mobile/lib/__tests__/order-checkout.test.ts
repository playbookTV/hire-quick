import { describe, expect, it, vi } from 'vitest';
import { loadOrderSummary, readOrderOutcome, validateOrderRoster } from '../order-checkout.js';
import type { Booking } from '../types.js';
import type { CheckoutResponse } from '@hq/shared';

const orderId = '22222222-2222-4222-8222-222222222222';
const eventId = '11111111-1111-4111-8111-111111111111';
const firstId = '33333333-3333-4333-8333-333333333333';
const secondId = '44444444-4444-4444-8444-444444444444';
const checkout: CheckoutResponse = {
  orderId,
  eventId,
  bookingIds: [firstId, secondId],
  amountKobo: 10001,
  reference: 'original-reference',
  authorizationUrl: 'https://checkout.paystack.com/original',
  state: 'READY',
  expiresAt: '2030-01-01T00:00:00.000Z',
  duplicate: true,
};
const bookings: Booking[] = [firstId, secondId].map((id, i) => ({
  id,
  orderId,
  eventId,
  usherId: `usher-${i}`,
  status: 'PENDING_PAYMENT',
  amount: i === 0 ? 5000 : 5001,
  createdAt: '2026-09-26T00:00:00Z',
  usher: { displayName: i === 0 ? 'Ada' : 'Tola' },
}));

describe('server-backed checkout recovery', () => {
  it('restores the existing order and exact staff amounts without local storage or a new confirmation', async () => {
    const get = vi.fn(async (path: string) =>
      path.endsWith('/checkout') ? checkout : bookings.find((b) => path.endsWith(b.id)),
    );
    const result = await loadOrderSummary(orderId, get);
    expect(result).toEqual({ checkout, bookings });
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      `/api/payments/orders/${orderId}/checkout`,
      `/api/bookings/${firstId}`,
      `/api/bookings/${secondId}`,
    ]);
    expect(result.checkout.reference).toBe('original-reference');
  });
  it('does not return a partial summary when one booked person cannot load', async () => {
    const get = async (path: string) => {
      if (path.endsWith('/checkout')) return checkout;
      if (path.endsWith(firstId)) return bookings[0];
      throw new Error('Connection interrupted');
    };
    await expect(loadOrderSummary(orderId, get)).rejects.toThrow('Connection interrupted');
  });
  it('rejects a response for another order', () => {
    expect(() => readOrderOutcome(firstId, checkout)).toThrow('another order');
  });
  it.each([
    [],
    [bookings[0]],
    [bookings[0], bookings[0]],
    [bookings[0], { ...bookings[1], amount: 5000 }],
    [bookings[0], { ...bookings[1], orderId: firstId }],
    [bookings[0], { ...bookings[1], eventId: secondId }],
    [bookings[0], { ...bookings[1], usher: { displayName: '' } }],
  ])('refuses an incomplete or mismatched roster %#', (...entries) => {
    expect(() => validateOrderRoster(checkout, entries as Booking[])).toThrow('every person');
  });
});
