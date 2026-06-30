import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { autoComplete } from '../service.js';

const SECRET = 'lifecycle_secret';
const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: SECRET });
const sign = (b: string): string => createHmac('sha512', SECRET).update(b).digest('hex');

const phones: string[] = [];
const userIds: string[] = [];
const eventIds: string[] = [];

function newPhone(): string {
  const p = `+234${randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')}`;
  phones.push(p);
  return p;
}

async function login(role: 'CLIENT' | 'USHER'): Promise<{ token: string; userId: string; phone: string }> {
  const phone = newPhone();
  const r1 = await request(app).post('/auth/otp/request').send({ phone });
  const r2 = await request(app).post('/auth/otp/verify').send({ phone, code: r1.body.devCode, role });
  userIds.push(r2.body.user.id);
  return { token: r2.body.accessToken, userId: r2.body.user.id, phone };
}

async function chargeWebhook(orderId: string): Promise<void> {
  const payload = JSON.stringify({
    event: 'charge.success',
    data: { id: 1, reference: `hq_${orderId}`, status: 'success' },
  });
  const res = await request(app)
    .post('/webhooks/paystack')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', sign(payload))
    .send(payload);
  expect(res.status).toBe(200);
}

afterEach(async () => {
  const bookings = await prisma.booking.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
  const bIds = bookings.map((b) => b.id);
  await prisma.escrowLedger.deleteMany({ where: { bookingId: { in: bIds } } });
  await prisma.walletLedger.deleteMany({ where: { bookingId: { in: bIds } } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: bIds } } });
  await prisma.dispute.deleteMany({ where: { bookingId: { in: bIds } } });
  await prisma.verificationCode.deleteMany({ where: { subjectRef: { in: [...bIds, ...phones] } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.application.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.invitation.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  phones.length = 0;
  userIds.length = 0;
  eventIds.length = 0;
});

async function setupConfirmedBooking(opts: { eventDate: string; startTime: string; endTime: string }): Promise<{
  clientToken: string;
  usherToken: string;
  eventId: string;
  bookingId: string;
  walletId: string;
}> {
  const client = await login('CLIENT');
  const usher = await login('USHER');
  // verify the usher (admin path is covered elsewhere)
  const usherRow = await prisma.usher.findFirstOrThrow({ where: { userId: usher.userId }, include: { wallet: true } });
  await prisma.usher.update({ where: { id: usherRow.id }, data: { verificationStatus: 'VERIFIED' } });

  const ev = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Gala Ushers',
      venue: 'Eko Hotel',
      category: 'Gala',
      eventDate: opts.eventDate,
      startTime: opts.startTime,
      endTime: opts.endTime,
      headcount: 1,
      budgetPerHeadKobo: 2_000_000,
    });
  expect(ev.status).toBe(201);
  const eventId = ev.body.id as string;
  eventIds.push(eventId);

  const apply = await request(app).post(`/api/events/${eventId}/apply`).set('Authorization', `Bearer ${usher.token}`).send({});
  expect(apply.status).toBe(201);
  const applicationId = apply.body.id as string;

  const accept = await request(app)
    .patch(`/api/applications/${applicationId}`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({ status: 'ACCEPTED' });
  expect(accept.status).toBe(200);

  const confirm = await request(app)
    .post(`/api/events/${eventId}/confirm`)
    .set('Authorization', `Bearer ${client.token}`)
    .set('Idempotency-Key', randomUUID())
    .send({ applicationIds: [applicationId], email: 'client@hq.dev' });
  expect(confirm.status).toBe(201);
  const orderId = confirm.body.orderId as string;
  const bookingId = confirm.body.bookingIds[0] as string;

  await chargeWebhook(orderId);
  const held = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  expect(held.status).toBe('CONFIRMED');

  return { clientToken: client.token, usherToken: usher.token, eventId, bookingId, walletId: usherRow.wallet!.id };
}

describe('full booking lifecycle (TRD §7/§8/§12)', () => {
  it('event → apply → accept → confirm → charge → attendance → complete → wallet credited', async () => {
    const s = await setupConfirmedBooking({ eventDate: '2026-09-01', startTime: '10:00', endTime: '18:00' });

    const gen = await request(app)
      .post(`/api/bookings/${s.bookingId}/checkin/generate`)
      .set('Authorization', `Bearer ${s.clientToken}`);
    expect(gen.status).toBe(200);
    const code = gen.body.code as string;
    expect(code).toMatch(/^\d{4,}$/); // returned in every env so the client can relay it

    const verify = await request(app)
      .post(`/api/bookings/${s.bookingId}/checkin/verify`)
      .set('Authorization', `Bearer ${s.usherToken}`)
      .send({ code });
    expect(verify.status).toBe(200);

    const complete = await request(app)
      .post(`/api/bookings/${s.bookingId}/complete`)
      .set('Authorization', `Bearer ${s.clientToken}`);
    expect(complete.status).toBe(200);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingId } });
    expect(booking.status).toBe('PAID');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } });
    expect(wallet.availableBalance).toBe(1_700_000); // ₦20,000 − 15%
  });

  it('client-passive auto-complete pays the usher who self-asserted arrival (D1)', async () => {
    // event already in the past so end + grace has elapsed
    const s = await setupConfirmedBooking({ eventDate: '2020-01-01', startTime: '10:00', endTime: '18:00' });

    const arrived = await request(app)
      .post(`/api/bookings/${s.bookingId}/arrived`)
      .set('Authorization', `Bearer ${s.usherToken}`);
    expect(arrived.status).toBe(200);

    const { completed } = await autoComplete(new Date());
    expect(completed).toContain(s.bookingId);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingId } });
    expect(booking.status).toBe('PAID');
    expect(booking.attendanceMethod).toBe('AUTO');
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } });
    expect(wallet.availableBalance).toBe(1_700_000);
  });

  it('opening a dispute freezes the escrow', async () => {
    const s = await setupConfirmedBooking({ eventDate: '2026-09-01', startTime: '10:00', endTime: '18:00' });

    const dispute = await request(app)
      .post(`/api/bookings/${s.bookingId}/disputes`)
      .set('Authorization', `Bearer ${s.clientToken}`)
      .send({ reason: 'no-show claim', note: 'usher did not appear' });
    expect(dispute.status).toBe(201);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingId }, include: { payment: true } });
    expect(booking.status).toBe('DISPUTED');
    expect(booking.payment?.escrowStatus).toBe('FROZEN');
  });
});
