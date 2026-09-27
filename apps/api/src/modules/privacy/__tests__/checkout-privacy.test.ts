/** Checkout PII is scrubbed without losing financial recovery references. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { buildExport, eraseUser } from '../service.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';
import { reconcileCheckout } from '../../payments/checkout.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
const scenarios: Scenario[] = [];
let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (!validated) return;
  for (const s of scenarios.splice(0).reverse()) await teardown(s);
});
async function fixture(state: 'READY' | 'EXPIRED' | 'REFUND_PENDING' = 'READY') {
  const s = await createScenario({ headcount: 1, amountKobo: 10000 });
  scenarios.push(s);
  const reference = `hq-${s.orderId}`;
  await prisma.order.update({ where: { id: s.orderId }, data: { paystackChargeRef: reference } });
  const checkout = await prisma.checkout.create({
    data: {
      orderId: s.orderId,
      reference,
      email: `checkout-${s.orderId}@example.test`,
      state,
      authorizationUrl: `https://checkout.example.test/private-bearer-${s.orderId}`,
      attemptedAt: new Date(Date.now() - 3_600_000),
      expiresAt: new Date(Date.now() - 1_800_000),
    },
  });
  if (state === 'EXPIRED')
    await prisma.booking.updateMany({
      where: { orderId: s.orderId },
      data: { status: 'CANCELLED' },
    });
  return { s, checkout };
}

describe('checkout data export and erasure', () => {
  it('exports the client’s own checkout email/state/reference without hosted bearer URLs', async () => {
    const own = await fixture();
    const other = await fixture();
    const exported = await buildExport(own.s.clientUserId);
    expect(exported).toMatchObject({
      client: {
        orders: [
          {
            id: own.s.orderId,
            checkout: {
              orderId: own.s.orderId,
              email: own.checkout.email,
              state: 'READY',
              reference: own.checkout.reference,
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain('authorizationUrl');
    expect(serialized).not.toContain(own.checkout.authorizationUrl);
    expect(serialized).not.toContain(other.checkout.email);
    expect(serialized).not.toContain(other.checkout.reference);
  });
  it.each(['READY', 'EXPIRED', 'REFUND_PENDING'] as const)(
    'scrubs checkout contact details in %s while preserving recovery state and references',
    async (state) => {
      const { s, checkout } = await fixture(state);
      const other = await fixture();
      const order = await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
      const bookings = await prisma.booking.findMany({ where: { orderId: s.orderId } });
      await prisma.$transaction((tx) => eraseUser(tx, s.clientUserId), TX);
      await prisma.$transaction((tx) => eraseUser(tx, s.clientUserId), TX);
      const after = await prisma.checkout.findUniqueOrThrow({ where: { orderId: s.orderId } });
      expect(after).toMatchObject({
        email: '',
        authorizationUrl: null,
        reference: checkout.reference,
        state,
        expiresAt: checkout.expiresAt,
        attemptedAt: checkout.attemptedAt,
      });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } })).toEqual(order);
      expect(await prisma.booking.findMany({ where: { orderId: s.orderId } })).toEqual(bookings);
      expect(
        (await prisma.checkout.findUniqueOrThrow({ where: { orderId: other.s.orderId } })).email,
      ).toBe(other.checkout.email);
    },
  );
  it('still reconciles and refunds a captured expired checkout after its client has been anonymized', async () => {
    const { s, checkout } = await fixture('EXPIRED');
    await prisma.$transaction((tx) => eraseUser(tx, s.clientUserId), TX);
    const paystack = new InMemoryPaystack();
    paystack.setBalanceKobo(10000);
    vi.spyOn(paystack, 'verifyCheckout').mockResolvedValue({
      status: 'success',
      reference: checkout.reference,
      amountKobo: 10000,
    });
    const refund = vi.spyOn(paystack, 'refund');
    const initialize = vi.spyOn(paystack, 'initializeCharge');
    await reconcileCheckout({ prisma, paystack }, s.orderId);
    const after = await prisma.checkout.findUniqueOrThrow({ where: { orderId: s.orderId } });
    expect(after).toMatchObject({
      email: '',
      authorizationUrl: null,
      reference: checkout.reference,
      state: 'REFUNDED',
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.clientUserId } })).status).toBe(
      'ANONYMIZED',
    );
    expect((await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } })).status).toBe(
      'REFUNDED',
    );
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingIds[0]! } })).status,
    ).toBe('REFUNDED');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith({
      chargeReference: checkout.reference,
      amountKobo: 10000,
      reference: `BOOKING_REFUND:${s.bookingIds[0]!}`,
    });
    expect(initialize).not.toHaveBeenCalled();
    expect(
      await prisma.notification.count({
        where: { userId: s.clientUserId, type: 'CHECKOUT_UPDATED', targetId: s.orderId },
      }),
    ).toBe(0);
    expect(await paystack.getBalanceKobo()).toBe(0);
    const escrow = await prisma.escrowLedger.aggregate({
      where: { bookingId: s.bookingIds[0]! },
      _sum: { amount: true },
    });
    expect(escrow._sum.amount).toBe(0);
    expect(
      (
        await prisma.paymentOperation.findUniqueOrThrow({
          where: { dedupeKey: `BOOKING_REFUND:${s.bookingIds[0]!}` },
        })
      ).status,
    ).toBe('RECORDED');
  });
});
