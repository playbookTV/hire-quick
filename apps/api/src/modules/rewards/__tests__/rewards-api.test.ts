/**
 * HTTP coverage for the reward surfaces: admin tier CRUD + fulfilment queue,
 * and badge-aware ranking of applicants for the hiring client.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { signAccessToken } from '../../auth/tokens.js';

const app = createApp({ paystack: new InMemoryPaystack(), paystackSecret: 'x' });

const userIds: string[] = [];
const tierIds: string[] = [];
const eventIds: string[] = [];
const clientIds: string[] = [];
const usherIds: string[] = [];

function tag(): string {
  return randomUUID().slice(0, 8);
}

async function makeAdmin(): Promise<string> {
  const u = await prisma.user.create({ data: { role: 'ADMIN', phone: `+23470${tag()}`, status: 'ACTIVE' } });
  userIds.push(u.id);
  return signAccessToken(u.id, 'ADMIN');
}

afterEach(async () => {
  await prisma.usherMilestone.deleteMany({ where: { tierId: { in: tierIds } } });
  await prisma.application.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.milestoneTier.deleteMany({ where: { id: { in: tierIds } } });
  await prisma.usher.deleteMany({ where: { id: { in: usherIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = tierIds.length = eventIds.length = clientIds.length = usherIds.length = 0;
});

describe('admin milestone tier CRUD', () => {
  it('creates, lists, updates, and soft-deletes a tier', async () => {
    const token = await makeAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post('/api/admin/milestone-tiers')
      .set(auth)
      .send({ threshold: 777, name: 'Test Tier', rewardType: 'PHYSICAL', description: 'd' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    tierIds.push(id);

    const list = await request(app).get('/api/admin/milestone-tiers').set(auth);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some((t) => t.id === id)).toBe(true);

    const patched = await request(app).patch(`/api/admin/milestone-tiers/${id}`).set(auth).send({ name: 'Renamed' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Renamed');

    const removed = await request(app).delete(`/api/admin/milestone-tiers/${id}`).set(auth);
    expect(removed.status).toBe(200);
    expect(removed.body.active).toBe(false);
  });

  it('rejects an invalid tier payload with 400 VALIDATION', async () => {
    const token = await makeAdmin();
    const res = await request(app)
      .post('/api/admin/milestone-tiers')
      .set({ Authorization: `Bearer ${token}` })
      .send({ threshold: -1, name: 'x', rewardType: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('admin milestone fulfilment queue', () => {
  it('lists an unlocked physical reward and fulfils it once', async () => {
    const token = await makeAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    const usherUser = await prisma.user.create({
      data: { role: 'USHER', phone: `+23488${tag()}`, status: 'ACTIVE', usher: { create: { verificationStatus: 'VERIFIED' } } },
      include: { usher: true },
    });
    userIds.push(usherUser.id);
    usherIds.push(usherUser.usher!.id);
    const tier = await prisma.milestoneTier.create({ data: { threshold: 999, name: 'Dress', rewardType: 'PHYSICAL' } });
    tierIds.push(tier.id);
    const ms = await prisma.usherMilestone.create({ data: { usherId: usherUser.usher!.id, tierId: tier.id } });

    const list = await request(app).get('/api/admin/milestones?status=UNLOCKED').set(auth);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some((m) => m.id === ms.id)).toBe(true);

    const fulfil = await request(app).post(`/api/admin/milestones/${ms.id}/fulfill`).set(auth);
    expect(fulfil.status).toBe(200);
    expect(fulfil.body.status).toBe('FULFILLED');

    // second attempt is a conflict, not a silent re-write
    const again = await request(app).post(`/api/admin/milestones/${ms.id}/fulfill`).set(auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_FULFILLED');
  });
});

describe('applicant ranking favours badged ushers', () => {
  it('orders applications by completedJobsCount desc', async () => {
    const t = tag();
    const clientUser = await prisma.user.create({
      data: { role: 'CLIENT', phone: `+23460${t}`, status: 'ACTIVE', client: { create: { displayName: `C ${t}` } } },
      include: { client: true },
    });
    userIds.push(clientUser.id);
    clientIds.push(clientUser.client!.id);
    const clientToken = signAccessToken(clientUser.id, 'CLIENT');

    const lowUser = await prisma.user.create({
      data: { role: 'USHER', phone: `+23481${t}`, status: 'ACTIVE', usher: { create: { completedJobsCount: 0 } } },
      include: { usher: true },
    });
    const highUser = await prisma.user.create({
      data: { role: 'USHER', phone: `+23482${t}`, status: 'ACTIVE', usher: { create: { completedJobsCount: 50 } } },
      include: { usher: true },
    });
    userIds.push(lowUser.id, highUser.id);
    usherIds.push(lowUser.usher!.id, highUser.usher!.id);

    const event = await prisma.event.create({
      data: {
        clientId: clientUser.client!.id,
        title: `Ranking ${t}`,
        venue: 'V',
        eventDate: new Date('2026-09-01'),
        startTime: '10:00',
        endTime: '14:00',
        category: 'Test',
        headcount: 2,
        budgetPerHead: 2_000_000,
        status: 'OPEN',
      },
    });
    eventIds.push(event.id);
    // Insert low applicant first, so default ordering would put it first.
    await prisma.application.create({ data: { eventId: event.id, usherId: lowUser.usher!.id, status: 'APPLIED' } });
    await prisma.application.create({ data: { eventId: event.id, usherId: highUser.usher!.id, status: 'APPLIED' } });

    const res = await request(app)
      .get(`/api/events/${event.id}/applications`)
      .set({ Authorization: `Bearer ${await clientToken}` });
    expect(res.status).toBe(200);
    const ordered = res.body as { usherId: string }[];
    expect(ordered[0]!.usherId).toBe(highUser.usher!.id); // badged usher ranks first
  });
});
