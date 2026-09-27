/**
 * Test fixtures for the ledger suites. Each scenario creates an isolated
 * client/usher/event/order with N PENDING_PAYMENT bookings, and a teardown that
 * removes exactly what it made so the shared Neon DB returns to baseline
 * (important for the global reconciliation aggregate).
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';

/** Historical in-window instant for the standard September 1 event fixture. */
export const FIXTURE_DISPUTE_TIME = new Date('2026-09-02T12:00:00Z');

export interface Scenario {
  clientUserId: string;
  usherUserId: string;
  clientId: string;
  usherId: string;
  walletId: string;
  eventId: string;
  orderId: string;
  bookingIds: string[];
  amountKobo: number;
}

export async function createScenario(
  opts: { headcount?: number; amountKobo?: number } = {},
): Promise<Scenario> {
  const headcount = opts.headcount ?? 3;
  const amountKobo = opts.amountKobo ?? 2_000_000; // ₦20,000
  const tag = randomUUID().slice(0, 8);

  const clientUser = await prisma.user.create({
    data: {
      role: 'CLIENT',
      phone: `+234999${tag}`,
      passwordHash: 'x',
      status: 'ACTIVE',
      client: { create: { displayName: `Client ${tag}` } },
    },
    include: { client: true },
  });
  const usherUser = await prisma.user.create({
    data: {
      role: 'USHER',
      phone: `+234888${tag}`,
      passwordHash: 'x',
      status: 'ACTIVE',
      usher: { create: { verificationStatus: 'VERIFIED', wallet: { create: {} } } },
    },
    include: { usher: { include: { wallet: true } } },
  });

  const clientId = clientUser.client!.id;
  const usherId = usherUser.usher!.id;
  const walletId = usherUser.usher!.wallet!.id;

  const event = await prisma.event.create({
    data: {
      clientId,
      title: `Event ${tag}`,
      venue: 'Test Venue',
      eventDate: new Date('2026-09-01'),
      startTime: '10:00',
      endTime: '18:00',
      category: 'Test',
      headcount,
      budgetPerHead: amountKobo,
      status: 'OPEN',
    },
  });

  const order = await prisma.order.create({
    data: { clientId, eventId: event.id, grossAmount: amountKobo * headcount, status: 'PENDING' },
  });

  const bookingIds: string[] = [];
  for (let i = 0; i < headcount; i++) {
    const b = await prisma.booking.create({
      data: {
        eventId: event.id,
        usherId,
        orderId: order.id,
        amount: amountKobo,
        status: 'PENDING_PAYMENT',
      },
    });
    bookingIds.push(b.id);
  }

  return {
    clientUserId: clientUser.id,
    usherUserId: usherUser.id,
    clientId,
    usherId,
    walletId,
    eventId: event.id,
    orderId: order.id,
    bookingIds,
    amountKobo,
  };
}

export async function teardown(s: Scenario): Promise<void> {
  await prisma.escrowLedger.deleteMany({ where: { bookingId: { in: s.bookingIds } } });
  await prisma.walletLedger.deleteMany({ where: { walletId: s.walletId } });
  // Durable operation records this scenario may have created (refund/transfer).
  const wds = await prisma.withdrawal.findMany({
    where: { walletId: s.walletId },
    select: { id: true },
  });
  await prisma.paymentOperation.deleteMany({
    where: {
      dedupeKey: {
        in: [
          ...s.bookingIds.map((id) => `BOOKING_REFUND:${id}`),
          ...wds.map((w) => `WITHDRAWAL_TRANSFER:${w.id}`),
          ...wds.map((w) => `WITHDRAWAL_REVERSAL:${w.id}`),
        ],
      },
    },
  });
  await prisma.withdrawal.deleteMany({ where: { walletId: s.walletId } });
  await prisma.bankAccount.deleteMany({ where: { usherId: s.usherId } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: s.bookingIds } } });
  await prisma.booking.deleteMany({ where: { orderId: s.orderId } });
  await prisma.order.delete({ where: { id: s.orderId } }).catch(() => undefined);
  await prisma.event.delete({ where: { id: s.eventId } }).catch(() => undefined);
  await prisma.wallet.delete({ where: { id: s.walletId } }).catch(() => undefined);
  await prisma.usher.delete({ where: { id: s.usherId } }).catch(() => undefined);
  await prisma.client.delete({ where: { id: s.clientId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [s.clientUserId, s.usherUserId] } } });
}

/** Sum every escrow_ledger row for a booking — must be 0 once fully settled (§25). */
export async function bookingLedgerSum(bookingId: string): Promise<number> {
  const agg = await prisma.escrowLedger.aggregate({ where: { bookingId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}
