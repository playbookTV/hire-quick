import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import type { BookingStatus, UserRole } from '@hq/shared';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { VENUE_MASKED } from '../venue.js';

const app = createApp();
let validated = false;
const userIds: string[] = [];
const eventIds: string[] = [];
let owner: { id: string; token: string; clientId: string };
let usher: { id: string; token: string; usherId: string };
let other: { id: string; token: string; usherId: string };
let adminToken: string;

async function user(role: UserRole) {
  const row = await prisma.user.create({
    data: { phone: `privacy-${randomUUID()}`, role, status: 'ACTIVE' },
  });
  userIds.push(row.id);
  return { id: row.id, token: await signAccessToken(row.id, role) };
}

beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
  const clientUser = await user('CLIENT');
  const client = await prisma.client.create({
    data: { userId: clientUser.id, displayName: 'Venue owner' },
  });
  owner = { ...clientUser, clientId: client.id };
  const firstUser = await user('USHER');
  const first = await prisma.usher.create({
    data: { userId: firstUser.id, verificationStatus: 'VERIFIED', state: 'Lagos' },
  });
  usher = { ...firstUser, usherId: first.id };
  const otherUser = await user('USHER');
  const second = await prisma.usher.create({
    data: { userId: otherUser.id, verificationStatus: 'VERIFIED', state: 'Lagos' },
  });
  other = { ...otherUser, usherId: second.id };
  adminToken = (await user('ADMIN')).token;
});

afterAll(async () => {
  if (!validated) return;
  await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function fixture(status?: BookingStatus) {
  if (!validated) throw new Error('Disposable database guard did not pass');
  const event = await prisma.event.create({
    data: {
      clientId: owner.clientId,
      title: 'Venue privacy fixture',
      venue: `PRIVATE-${randomUUID()}`,
      state: 'Lagos',
      eventDate: new Date('2027-12-01'),
      startTime: '12:00',
      endTime: '18:00',
      category: 'USHER',
      headcount: 3,
      budgetPerHead: 100_000,
      status: 'OPEN',
    },
  });
  eventIds.push(event.id);
  const invitation = await prisma.invitation.create({
    data: { eventId: event.id, usherId: usher.usherId },
  });
  await prisma.application.create({
    data: { eventId: event.id, usherId: usher.usherId, status: 'ACCEPTED' },
  });
  await prisma.savedJob.create({ data: { eventId: event.id, usherId: usher.usherId } });
  // State-only fixtures test response authorization; they do not certify a payment lifecycle.
  const booking = status
    ? await prisma.booking.create({
        data: { eventId: event.id, usherId: usher.usherId, amount: 100_000, status },
      })
    : null;
  return { event, invitation, booking };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type EventJson = { id: string; venue: string; state?: string };
type JoinedJson = { id: string; event: EventJson };
async function get(path: string, token = usher.token) {
  return request(app)
    .get(`/api${path}`)
    .set('Authorization', `Bearer ${token}`)
    .timeout({ response: 15_000, deadline: 20_000 });
}
async function assertSurfaces(f: Fixture, unlocked: boolean) {
  const expected = unlocked ? f.event.venue : VENUE_MASKED;
  const paths: Array<[string, (body: unknown) => EventJson | undefined]> = [
    ['/events', (body) => (body as EventJson[]).find((e) => e.id === f.event.id)],
    [`/events/${f.event.id}`, (body) => body as EventJson],
    [
      '/me/applications',
      (body) => (body as JoinedJson[]).find((a) => a.event.id === f.event.id)?.event,
    ],
    ['/me/saved-jobs', (body) => (body as EventJson[]).find((e) => e.id === f.event.id)],
    [
      '/me/invitations',
      (body) => (body as JoinedJson[]).find((i) => i.id === f.invitation.id)?.event,
    ],
    [`/invitations/${f.invitation.id}`, (body) => (body as JoinedJson).event],
  ];
  if (f.booking)
    paths.push(
      ['/bookings', (body) => (body as JoinedJson[]).find((b) => b.id === f.booking!.id)?.event],
      [`/bookings/${f.booking.id}`, (body) => (body as JoinedJson).event],
    );
  for (const [path, select] of paths) {
    const response = await get(path);
    expect(
      response.status,
      `${path}: ${(response.body as { error?: { code?: string } }).error?.code ?? 'response'}`,
    ).toBe(200);
    expect(select(response.body)?.venue, path).toBe(expected);
    if (!unlocked) expect(JSON.stringify(response.body), path).not.toContain(f.event.venue);
  }
}

describe('venue privacy on every event-bearing usher response (OVA-140)', () => {
  it('keeps invitation/application/save access masked without any booking', async () => {
    await assertSurfaces(await fixture(), false);
  });
  it('masks all eight surfaces while the booking is pending payment', async () => {
    await assertSurfaces(await fixture('PENDING_PAYMENT'), false);
  });
  it('unlocks all eight surfaces once this usher has a confirmed booking', async () => {
    await assertSurfaces(await fixture('CONFIRMED'), true);
  });
  it('never uses another usher’s held booking to unlock the viewer', async () => {
    const f = await fixture('PENDING_PAYMENT');
    await prisma.booking.create({
      data: { eventId: f.event.id, usherId: other.usherId, status: 'CONFIRMED', amount: 100_000 },
    });
    await assertSurfaces(f, false);
  });
  it.each(['CANCELLED', 'NO_SHOW', 'REFUNDED'] as const)(
    'keeps the established masked policy for %s on all eight surfaces',
    async (status) => {
      await assertSurfaces(await fixture(status), false);
    },
  );
  it('uses the same event-level unlock when an older pending booking also exists', async () => {
    const f = await fixture('PENDING_PAYMENT');
    await prisma.booking.create({
      data: { eventId: f.event.id, usherId: usher.usherId, status: 'PAID', amount: 100_000 },
    });
    await assertSurfaces(f, true);
  });
  it('preserves owning-client visibility and existing invitation/booking party checks', async () => {
    const f = await fixture('PENDING_PAYMENT');
    for (const path of [
      '/events',
      `/events/${f.event.id}`,
      '/bookings',
      `/bookings/${f.booking!.id}`,
    ]) {
      const response = await get(path, owner.token);
      expect(response.status, path).toBe(200);
      expect(JSON.stringify(response.body), path).toContain(f.event.venue);
    }
    expect((await get(`/events/${f.event.id}`, adminToken)).body.venue).toBe(f.event.venue);
    expect((await get(`/invitations/${f.invitation.id}`, other.token)).status).toBe(404);
    expect((await get(`/bookings/${f.booking!.id}`, other.token)).status).toBe(403);
    expect((await get(`/bookings/${f.booking!.id}`, adminToken)).status).toBe(403);
    const otherBookings = await get('/bookings', other.token);
    expect(otherBookings.status).toBe(200);
    expect(
      (otherBookings.body as JoinedJson[]).some((booking) => booking.id === f.booking!.id),
    ).toBe(false);
  });
});
