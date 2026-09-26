import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  booking: vi.fn(),
  bookings: vi.fn(),
  refund: vi.fn(),
  client: vi.fn(),
  usher: vi.fn(),
}));
vi.mock('@hq/database', () => ({
  prisma: {
    booking: { findUniqueOrThrow: mocks.booking, findMany: mocks.bookings },
    paymentOperation: { findUnique: mocks.refund },
    client: { findFirstOrThrow: mocks.client },
    usher: { findFirstOrThrow: mocks.usher },
  },
}));
vi.mock('../../../app.js', () => ({
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../auth/middleware.js', () => ({
  requireAuth: (_r: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../service.js', () => ({
  generateCheckin: vi.fn(),
  verifyCheckin: vi.fn(),
  assertArrival: vi.fn(),
  completeBooking: vi.fn(),
  openDispute: vi.fn(),
  createReview: vi.fn(),
  cancelBookingByClient: vi.fn(),
  cancelBookingByUsher: vi.fn(),
}));
vi.mock('../../events/venue.js', () => ({
  serializeEventVenue: (event: unknown) => event,
  venueUnlockedEventIds: async () => new Set(['event']),
}));
import { bookingsRouter } from '../routes.js';
import { noopGateway } from '../../../realtime/gateway.js';
const router = bookingsRouter({ realtime: noopGateway });
type Layer = {
  route?: {
    path: string;
    methods: { get?: boolean };
    stack: { handle: (req: unknown, res: unknown, next: (error: unknown) => void) => void }[];
  };
};
function read(path: string, userId = 'client-user', role = 'CLIENT'): Promise<unknown> {
  const layer = (router.stack as unknown as Layer[]).find(
    (x) => x.route?.path === path && x.route.methods.get,
  )!;
  return new Promise((resolve, reject) =>
    layer.route!.stack[0]!.handle(
      { auth: { userId, role }, params: { id: 'booking' } },
      { json: resolve },
      reject,
    ),
  );
}
const booking = {
  id: 'booking',
  eventId: 'event',
  usherId: 'usher',
  amount: 2_000_000,
  status: 'CONFIRMED',
  event: {
    eventDate: new Date('2026-09-22T00:00:00Z'),
    startTime: '10:00',
    endTime: '18:00',
    client: { userId: 'client-user' },
  },
  usher: { userId: 'usher-user' },
  reviews: [],
  disputes: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T09:00:00Z'));
  mocks.booking.mockResolvedValue(booking);
  mocks.refund.mockResolvedValue(null);
  mocks.client.mockResolvedValue({ id: 'client' });
  mocks.usher.mockResolvedValue({ id: 'usher' });
});
afterEach(() => vi.useRealTimers());
describe('participant booking flow reads', () => {
  it('quotes the approved split at the exact 48-hour boundary in Lagos time', async () => {
    expect(await read('/bookings/:id/cancellation-quote')).toMatchObject({
      actor: 'CLIENT',
      window: 'BETWEEN_12_48H',
      clientRefundPct: 50,
      eligible: true,
      selfServe: true,
      platformFeeKobo: 150_000,
      usherPayoutKobo: 850_000,
      requiresApproval: false,
      gross: 2_000_000,
    });
    expect(mocks.refund).toHaveBeenCalled();
  });
  it('quotes the same booking by actor and allows the existing full usher cancellation', async () => {
    expect(await read('/bookings/:id/cancellation-quote', 'usher-user', 'USHER')).toMatchObject({
      actor: 'USHER',
      clientRefundPct: 100,
      usherPayoutPct: 0,
      selfServe: true,
    });
  });
  it('rejects other users before returning a quote or reading refund records', async () => {
    await expect(read('/bookings/:id/cancellation-quote', 'outsider')).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(read('/bookings/:id', 'outsider')).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it('does not offer a fresh cancellation after a terminal outcome', async () => {
    mocks.booking.mockResolvedValue({ ...booking, status: 'REFUNDED' });
    expect(await read('/bookings/:id/cancellation-quote', 'usher-user', 'USHER')).toMatchObject({
      eligible: false,
      selfServe: false,
    });
  });
  it('returns the caller review and queries only the safe refund projection', async () => {
    mocks.booking.mockResolvedValue({
      ...booking,
      reviews: [{ id: 'review', rating: 5, comment: 'Thanks' }],
    });
    mocks.refund.mockResolvedValue({
      id: 'operation',
      status: 'PROVIDER_PENDING',
      providerRef: 'refund-ref',
    });
    expect(await read('/bookings/:id')).toMatchObject({
      myReview: { id: 'review' },
      refund: { id: 'operation' },
    });
    expect(mocks.booking).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          reviews: expect.objectContaining({ where: { reviewerId: 'client-user' } }),
        }),
      }),
    );
    expect(mocks.refund).toHaveBeenCalledWith({
      where: { dedupeKey: 'BOOKING_REFUND:booking' },
      select: {
        id: true,
        status: true,
        providerRef: true,
        createdAt: true,
        updatedAt: true,
        payload: true,
      },
    });
  });
  it.each([
    ['CLIENT', 'client-user', { event: { clientId: 'client' } }],
    ['USHER', 'usher-user', { usherId: 'usher' }],
  ])(
    'scopes %s history and counts only unseen messages from the other participant',
    async (role, userId, where) => {
      mocks.bookings.mockResolvedValue([{ ...booking, conversation: { _count: { messages: 2 } } }]);
      const result = await read('/bookings', userId as string, role as string);
      expect(result).toMatchObject([{ id: 'booking', unreadCount: 2, myReview: null }]);
      expect(result).toEqual([expect.not.objectContaining({ conversation: expect.anything() })]);
      expect(mocks.bookings).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          include: expect.objectContaining({
            conversation: {
              select: {
                _count: {
                  select: { messages: { where: { senderId: { not: userId }, seenAt: null } } },
                },
              },
            },
          }),
        }),
      );
    },
  );
});
