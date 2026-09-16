/**
 * HTTP coverage for the screen-wiring endpoints added for the mobile app:
 * usher discovery/profile/reviews, wallet read, availability, review POST,
 * and client booking cancellation. DB-backed; mirrors rewards-api.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { signAccessToken } from '../../auth/tokens.js';
import { holdOrder, releaseBooking, markCheckedIn } from '../../payments/ledger/ledger.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });

const userIds: string[] = [];
const usherIds: string[] = [];
const clientIds: string[] = [];
let scenario: Scenario | null = null;

function tag(): string {
  return randomUUID().slice(0, 8);
}

async function makeUsher(displayName = `Usher ${tag()}`): Promise<{ userId: string; usherId: string; token: string }> {
  const u = await prisma.user.create({
    data: {
      role: 'USHER',
      phone: `+23470${tag()}`,
      status: 'ACTIVE',
      usher: { create: { displayName, verificationStatus: 'VERIFIED', ratingAvg: 4.5, completedJobsCount: 3, wallet: { create: {} } } },
    },
    include: { usher: true },
  });
  userIds.push(u.id);
  usherIds.push(u.usher!.id);
  return { userId: u.id, usherId: u.usher!.id, token: await signAccessToken(u.id, 'USHER') };
}

afterEach(async () => {
  if (scenario) {
    await prisma.review.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
    scenario = null;
  }
  await prisma.availability.deleteMany({ where: { usherId: { in: usherIds } } });
  await prisma.wallet.deleteMany({ where: { usherId: { in: usherIds } } });
  await prisma.usher.deleteMany({ where: { id: { in: usherIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0;
  usherIds.length = 0;
  clientIds.length = 0;
});

describe('availability (usher)', () => {
  it('PUT then GET returns the marked day', async () => {
    const { token } = await makeUsher();
    const auth = { Authorization: `Bearer ${token}` };
    const put = await request(app).put('/api/me/availability').set(auth).send({ date: '2026-07-05', status: 'AVAILABLE' });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/me/availability?from=2026-07-01&to=2026-07-31').set(auth);
    expect(get.status).toBe(200);
    expect(get.body).toHaveLength(1);
    expect(get.body[0].status).toBe('AVAILABLE');
  });
});

describe('wallet read (usher)', () => {
  it('returns availableBalance / pendingEscrow / lifetimeEarned', async () => {
    const { token } = await makeUsher();
    const res = await request(app).get('/api/payments/wallet').set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ availableBalance: 0, pendingEscrow: 0, lifetimeEarned: 0 });
  });
});

describe('usher discovery + profile + reviews', () => {
  it('lists verified ushers and reads one profile', async () => {
    const { usherId, token } = await makeUsher('Ada Martins');
    const auth = { Authorization: `Bearer ${token}` };
    const list = await request(app).get('/api/ushers?verified=true').set(auth);
    expect(list.status).toBe(200);
    expect(list.body.some((u: { id: string }) => u.id === usherId)).toBe(true);
    const one = await request(app).get(`/api/ushers/${usherId}`).set(auth);
    expect(one.body.displayName).toBe('Ada Martins');
    const reviews = await request(app).get(`/api/ushers/${usherId}/reviews`).set(auth);
    expect(reviews.body).toEqual([]);
  });
});

describe('review after payout', () => {
  it('client reviews paid booking → recomputes usher ratingAvg', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 1_000_000 });
    const bid = scenario.bookingIds[0]!;
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_review'));
    await prisma.$transaction(async (tx) => {
      await markCheckedIn(tx, bid, 'OTP');
      return releaseBooking(tx, bid, 'OTP');
    });
    const token = await signAccessToken(scenario.clientUserId, 'CLIENT');
    const res = await request(app)
      .post(`/api/bookings/${scenario.bookingIds[0]}/reviews`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ rating: 5, comment: 'Great' });
    expect(res.status).toBe(201);
    const usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.ratingAvg).toBe(5);
    expect(usher.ratingCount).toBe(1);
  });
});

describe('client cancels confirmed booking', () => {
  it('full-refund window → REFUNDED', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 1_000_000 });
    // This case requires more than 48 hours before the event, regardless of
    // the calendar date on which the suite is run.
    await prisma.event.update({
      where: { id: scenario.eventId },
      data: { eventDate: new Date(Date.now() + 7 * 24 * 3_600_000) },
    });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_cancel'));
    const token = await signAccessToken(scenario.clientUserId, 'CLIENT');
    const res = await request(app)
      .post(`/api/bookings/${scenario.bookingIds[0]}/cancel`)
      .set({ Authorization: `Bearer ${token}`, 'Idempotency-Key': `cxl_${tag()}` })
      .send({ reason: 'change of plans' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REFUNDED');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: scenario.bookingIds[0]! } });
    expect(booking.status).toBe('REFUNDED');
  });
});
