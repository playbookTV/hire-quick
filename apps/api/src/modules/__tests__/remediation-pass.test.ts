/**
 * Compliance-remediation pass — DB-backed, serial.
 * Covers: A2 venue masking on list/detail, B4 consent capture + push suppression,
 * B5 privacy-policy publication + acceptance, C1 withdrawal verification gate.
 */
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp, ApiError } from '../../app.js';
import { InMemoryPaystack } from '../payments/port/paystack-port.js';
import { initWithdrawal } from '../payments/service.js';
import { PRIVACY_POLICY } from '../legal/policy.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });
const VENUE_MASKED = 'Exact venue is shared once your booking is confirmed';

const userIds: string[] = [];
const eventIds: string[] = [];
const bookingIds: string[] = [];

function newPhone(): string {
  return `+234${randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')}`;
}

async function login(role: 'CLIENT' | 'USHER'): Promise<{ token: string; userId: string }> {
  const phone = newPhone();
  const r1 = await request(app).post('/auth/otp/request').send({ phone });
  const code = r1.body.devCode as string;
  const r2 = await request(app).post('/auth/otp/verify').send({ phone, code, role });
  userIds.push(r2.body.user.id);
  return { token: r2.body.accessToken as string, userId: r2.body.user.id as string };
}

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  // Users cascade to client/usher/wallet/bankAccount/consent/deviceToken/policyAcceptance.
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function seedOpenEvent(): Promise<{ eventId: string; venue: string }> {
  const u = await prisma.user.create({ data: { role: 'CLIENT', phone: newPhone() } });
  userIds.push(u.id);
  const client = await prisma.client.create({ data: { userId: u.id, displayName: 'Test Client' } });
  const venue = `12 Secret Rd, Lekki ${randomUUID().slice(0, 6)}`;
  const event = await prisma.event.create({
    data: {
      clientId: client.id,
      title: 'Gala',
      venue,
      eventDate: new Date('2026-12-01'),
      startTime: '18:00',
      endTime: '22:00',
      category: 'USHER',
      headcount: 5,
      budgetPerHead: 500_000,
      accommodation: 'PROVIDED',
      status: 'OPEN',
    },
  });
  eventIds.push(event.id);
  return { eventId: event.id, venue };
}

describe('A2 — venue masking', () => {
  it('masks the precise venue in the list + detail until the usher has an escrow-held booking', async () => {
    const { token, userId } = await login('USHER');
    const usher = await prisma.usher.findUniqueOrThrow({ where: { userId } });
    const { eventId, venue } = await seedOpenEvent();

    // List: masked
    const list = await request(app).get('/api/events').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const inList = (list.body as Array<{ id: string; venue: string }>).find((e) => e.id === eventId);
    expect(inList?.venue).toBe(VENUE_MASKED);

    // Detail: masked
    const before = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(before.body.venue).toBe(VENUE_MASKED);

    // Hold escrow for this usher → venue unlocks
    const booking = await prisma.booking.create({
      data: { eventId, usherId: usher.id, amount: 500_000, status: 'CONFIRMED' },
    });
    bookingIds.push(booking.id);

    const after = await request(app).get(`/api/events/${eventId}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.venue).toBe(venue);

    const list2 = await request(app).get('/api/events').set('Authorization', `Bearer ${token}`);
    const inList2 = (list2.body as Array<{ id: string; venue: string }>).find((e) => e.id === eventId);
    expect(inList2?.venue).toBe(venue);
  });
});

describe('B4 — consent capture + push suppression', () => {
  it('registering a device records push consent; withdrawing it drops device tokens', async () => {
    const { token, userId } = await login('USHER');

    const reg = await request(app)
      .post('/api/me/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ fcmToken: `tok-${randomUUID()}`, platform: 'ANDROID' });
    expect(reg.status).toBe(201);

    const granted = await prisma.consentRecord.findUnique({
      where: { userId_purpose: { userId, purpose: 'PUSH_NOTIFICATIONS' } },
    });
    expect(granted?.granted).toBe(true);
    expect(await prisma.deviceToken.count({ where: { userId } })).toBe(1);

    const wd = await request(app)
      .post('/api/me/consents')
      .set('Authorization', `Bearer ${token}`)
      .send({ purpose: 'PUSH_NOTIFICATIONS', granted: false });
    expect(wd.status).toBe(200);
    expect(wd.body.granted).toBe(false);
    // Processing stops immediately: device tokens removed.
    expect(await prisma.deviceToken.count({ where: { userId } })).toBe(0);

    const list = await request(app).get('/api/me/consents').set('Authorization', `Bearer ${token}`);
    expect((list.body as Array<{ purpose: string; granted: boolean }>).some((c) => c.purpose === 'PUSH_NOTIFICATIONS' && !c.granted)).toBe(true);
  });
});

describe('B5 — privacy policy publication', () => {
  it('serves the current policy publicly and records a versioned acceptance', async () => {
    const pub = await request(app).get('/api/legal/privacy-policy');
    expect(pub.status).toBe(200);
    expect(pub.body.version).toBe(PRIVACY_POLICY.version);
    expect(typeof pub.body.body).toBe('string');

    const { token, userId } = await login('CLIENT');
    const accept = await request(app).post('/api/legal/privacy-policy/accept').set('Authorization', `Bearer ${token}`);
    expect(accept.status).toBe(201);
    expect(accept.body.version).toBe(PRIVACY_POLICY.version);

    const row = await prisma.policyAcceptance.findFirst({ where: { userId } });
    expect(row?.documentKey).toBe('privacy-policy');
  });
});

describe('C1 — withdrawal verification gate', () => {
  it('rejects a payout to an unverified bank account', async () => {
    const { userId } = await login('USHER');
    const usher = await prisma.usher.findUniqueOrThrow({ where: { userId } });
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { usherId: usher.id } });
    await prisma.wallet.update({ where: { id: wallet.id }, data: { availableBalance: 100_000 } });

    const bank = await prisma.bankAccount.create({
      data: {
        usherId: usher.id,
        bankCode: '058',
        accountNumber: '0000000000',
        accountName: 'TEST ACCOUNT',
        paystackRecipientCode: 'rcp_test',
        verified: false, // not yet verified
      },
    });

    const deps = { prisma, paystack: new InMemoryPaystack() };
    await expect(
      initWithdrawal(deps, {
        idempotencyKey: randomUUID(),
        usherId: usher.id,
        walletId: wallet.id,
        bankAccountId: bank.id,
        amountKobo: 5_000,
      }),
    ).rejects.toMatchObject({ code: 'UNVERIFIED_ACCOUNT' });

    // Sanity: the gate threw an ApiError (not a generic error).
    const err = await initWithdrawal(deps, {
      idempotencyKey: randomUUID(),
      usherId: usher.id,
      walletId: wallet.id,
      bankAccountId: bank.id,
      amountKobo: 5_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});
