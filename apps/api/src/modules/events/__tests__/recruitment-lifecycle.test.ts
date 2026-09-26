import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma, type EventStatus } from '@hq/database';
import { createApp } from '../../../app.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { signAccessToken } from '../../auth/tokens.js';
import { autoComplete, confirmBatch } from '../../bookings/service.js';
import { idempotencyStorageKey } from '../../payments/ledger/idempotency.js';
import {
  cancelBooking,
  holdOrder,
  markCheckedIn,
  refundBooking,
  completeBookingHeld,
} from '../../payments/ledger/ledger.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { lockBookingLifecycle } from '../staffing.js';
import {
  applyToEvent,
  inviteToEvent,
  replyToInvitation,
  selectApplication,
} from '../recruitment.js';

const users: string[] = [],
  events: string[] = [],
  keys: string[] = [];
const TX = { timeout: 30000, maxWait: 30000 };
let isolated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  isolated = true;
});
afterEach(async () => {
  if (!isolated) return;
  const bookings = await prisma.booking.findMany({
    where: { eventId: { in: events } },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  await prisma.escrowLedger.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.walletLedger.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.paymentOperation.deleteMany({
    where: { dedupeKey: { in: bookingIds.map((id) => `BOOKING_REFUND:${id}`) } },
  });
  await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.order.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  users.length = 0;
  events.length = 0;
  keys.length = 0;
});

async function fixture() {
  const client = await prisma.user.create({
    data: {
      phone: `recruit-client-${randomUUID()}`,
      role: 'CLIENT',
      status: 'ACTIVE',
      client: { create: { displayName: 'Recruitment client' } },
    },
    include: { client: true },
  });
  const usher = await prisma.user.create({
    data: {
      phone: `recruit-usher-${randomUUID()}`,
      role: 'USHER',
      status: 'ACTIVE',
      usher: { create: { verificationStatus: 'VERIFIED', wallet: { create: {} } } },
    },
    include: { usher: true },
  });
  users.push(client.id, usher.id);
  const event = await prisma.event.create({
    data: {
      clientId: client.client!.id,
      title: 'Recruitment event',
      venue: 'Lagos venue',
      category: 'Wedding',
      eventDate: new Date('2030-06-01'),
      startTime: '10:00',
      endTime: '18:00',
      headcount: 1,
      budgetPerHead: 10000,
      status: 'OPEN',
    },
  });
  events.push(event.id);
  const application = await prisma.application.create({
    data: { eventId: event.id, usherId: usher.usher!.id, status: 'ACCEPTED' },
  });
  const key = randomUUID();
  keys.push(idempotencyStorageKey(key, 'order', client.id));
  const params = {
    idempotencyKey: key,
    clientUserId: client.id,
    eventId: event.id,
    applicationIds: [application.id],
    email: 'recruit@example.com',
  };
  const paystack = new InMemoryPaystack();
  const initialize = vi.spyOn(paystack, 'initializeCharge');
  return {
    client,
    usher,
    usherId: usher.usher!.id,
    clientId: client.client!.id,
    event,
    application,
    params,
    paystack,
    initialize,
    deps: { prisma, paystack },
  };
}

describe('locked recruitment and staffing lifecycle', () => {
  it('rejects apply to closed or started events without changing the prior application', async () => {
    const f = await fixture();
    for (const status of [
      'DRAFT',
      'FULLY_STAFFED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ] as EventStatus[]) {
      await prisma.event.update({ where: { id: f.event.id }, data: { status } });
      await expect(applyToEvent(prisma, f.event.id, f.usherId)).rejects.toMatchObject({
        code: 'EVENT_LOCKED',
      });
    }
    await prisma.event.update({
      where: { id: f.event.id },
      data: { status: 'OPEN', eventDate: new Date('2020-01-01') },
    });
    const api = createApp({});
    const response = await request(api)
      .post(`/api/events/${f.event.id}/apply`)
      .set('Authorization', `Bearer ${await signAccessToken(f.usher.id, 'USHER')}`)
      .send({});
    expect(response.status).toBe(409);
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: f.application.id } })).status,
    ).toBe('ACCEPTED');
  });

  it('duplicate apply preserves acceptance and a normal rejected applicant can apply again', async () => {
    const f = await fixture();
    expect((await applyToEvent(prisma, f.event.id, f.usherId)).application.status).toBe('ACCEPTED');
    await selectApplication(prisma, f.application.id, f.clientId, 'REJECTED');
    expect((await applyToEvent(prisma, f.event.id, f.usherId)).application.status).toBe('APPLIED');
  });

  it('rechecks client suspension, staff suspension, and verification before selection and checkout', async () => {
    const f = await fixture();
    await prisma.user.update({ where: { id: f.client.id }, data: { status: 'SUSPENDED' } });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({
      code: 'SELECTION_CHANGED',
    });
    await prisma.user.update({ where: { id: f.client.id }, data: { status: 'ACTIVE' } });
    await prisma.user.update({ where: { id: f.usher.id }, data: { status: 'SUSPENDED' } });
    await expect(
      selectApplication(prisma, f.application.id, f.clientId, 'ACCEPTED'),
    ).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    await prisma.user.update({ where: { id: f.usher.id }, data: { status: 'ACTIVE' } });
    await prisma.usher.update({
      where: { id: f.usherId },
      data: { verificationStatus: 'REJECTED' },
    });
    await expect(inviteToEvent(prisma, f.event.id, f.clientId, f.usherId)).rejects.toMatchObject({
      code: 'SELECTION_CHANGED',
    });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({
      code: 'SELECTION_CHANGED',
    });
    expect(f.initialize).not.toHaveBeenCalled();
  });

  it('serializes different clients booking the same usher across overlapping events', async () => {
    const a = await fixture(),
      b = await fixture();
    await prisma.application.update({
      where: { id: b.application.id },
      data: { usherId: a.usherId },
    });
    const results = await Promise.allSettled([
      confirmBatch(a.deps, a.params),
      confirmBatch(b.deps, b.params),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'SCHEDULE_CONFLICT' } });
    expect(await prisma.booking.count({ where: { usherId: a.usherId } })).toBe(1);
    expect(a.initialize.mock.calls.length + b.initialize.mock.calls.length).toBe(1);
  });

  it('allows adjacent intervals but rejects unavailable dates before payment dispatch', async () => {
    const a = await fixture(),
      b = await fixture();
    await prisma.application.update({
      where: { id: b.application.id },
      data: { usherId: a.usherId },
    });
    await prisma.event.update({
      where: { id: b.event.id },
      data: { startTime: '18:00', endTime: '20:00' },
    });
    await prisma.availability.create({
      data: { usherId: a.usherId, date: a.event.eventDate, status: 'UNAVAILABLE' },
    });
    await expect(confirmBatch(a.deps, a.params)).rejects.toMatchObject({
      code: 'SCHEDULE_CONFLICT',
    });
    expect(a.initialize).not.toHaveBeenCalled();
    await prisma.availability.update({
      where: { usherId_date: { usherId: a.usherId, date: a.event.eventDate } },
      data: { status: 'AVAILABLE' },
    });
    await confirmBatch(a.deps, a.params);
    await confirmBatch(b.deps, b.params);
    expect(await prisma.booking.count({ where: { usherId: a.usherId } })).toBe(2);
  });

  it('serializes availability insertion with checkout so only one incompatible intent succeeds', async () => {
    const f = await fixture();
    const api = createApp({ paystack: f.paystack });
    const token = await signAccessToken(f.usher.id, 'USHER');
    const [confirmation, availability] = await Promise.allSettled([
      confirmBatch(f.deps, f.params),
      request(api)
        .put('/api/me/availability')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2030-06-01', status: 'UNAVAILABLE' }),
    ]);
    expect(availability.status).toBe('fulfilled');
    if (availability.status !== 'fulfilled') throw availability.reason;
    if (confirmation.status === 'fulfilled') {
      expect(availability.value.status).toBe(409);
      expect(
        await prisma.availability.findUnique({
          where: { usherId_date: { usherId: f.usherId, date: f.event.eventDate } },
        }),
      ).toBeNull();
    } else {
      expect(confirmation.reason).toMatchObject({ code: 'SCHEDULE_CONFLICT' });
      expect(availability.value.status).toBe(200);
      expect(await prisma.booking.count({ where: { eventId: f.event.id } })).toBe(0);
    }
  });

  it('accept/decline race leaves a successful decline withdrawn and impossible to reselect or reinvite', async () => {
    const f = await fixture();
    const { invitation } = await inviteToEvent(prisma, f.event.id, f.clientId, f.usherId);
    const results = await Promise.allSettled([
      replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED'),
      replyToInvitation(prisma, invitation.id, f.usherId, 'DECLINED'),
    ]);
    expect(results[1]!.status).toBe('fulfilled');
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status,
    ).toBe('DECLINED');
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: f.application.id } })).status,
    ).toBe('WITHDRAWN');
    await expect(
      replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED'),
    ).rejects.toMatchObject({ code: 'INVITATION_CLOSED' });
    await expect(inviteToEvent(prisma, f.event.id, f.clientId, f.usherId)).rejects.toMatchObject({
      code: 'INVITATION_CLOSED',
    });
    await expect(applyToEvent(prisma, f.event.id, f.usherId)).rejects.toMatchObject({
      code: 'INVITATION_CLOSED',
    });
    await expect(
      selectApplication(prisma, f.application.id, f.clientId, 'ACCEPTED'),
    ).rejects.toMatchObject({ code: 'INVITATION_CLOSED' });
    await expect(confirmBatch(f.deps, f.params)).rejects.toMatchObject({
      code: 'SELECTION_CHANGED',
    });
    expect(f.initialize).not.toHaveBeenCalled();
  });

  it('decline versus confirm permits either booking or withdrawal, never both', async () => {
    const f = await fixture();
    const { invitation } = await inviteToEvent(prisma, f.event.id, f.clientId, f.usherId);
    await replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED');
    const [decline, confirmation] = await Promise.allSettled([
      replyToInvitation(prisma, invitation.id, f.usherId, 'DECLINED'),
      confirmBatch(f.deps, f.params),
    ]);
    expect([decline, confirmation].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    if (decline.status === 'fulfilled') {
      expect(await prisma.booking.count({ where: { eventId: f.event.id } })).toBe(0);
      expect(
        (await prisma.application.findUniqueOrThrow({ where: { id: f.application.id } })).status,
      ).toBe('WITHDRAWN');
    } else {
      expect(decline.reason).toMatchObject({ code: 'ALREADY_CONFIRMED' });
      expect(
        (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status,
      ).toBe('ACCEPTED');
    }
  });

  it('replays acceptance without resurrecting client rejection and repairs legacy decline application state', async () => {
    const f = await fixture();
    const { invitation } = await inviteToEvent(prisma, f.event.id, f.clientId, f.usherId);
    await replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED');
    await selectApplication(prisma, f.application.id, f.clientId, 'REJECTED');
    await replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED');
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: f.application.id } })).status,
    ).toBe('REJECTED');
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'DECLINED' } });
    await prisma.application.update({
      where: { id: f.application.id },
      data: { status: 'ACCEPTED' },
    });
    await replyToInvitation(prisma, invitation.id, f.usherId, 'DECLINED');
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: f.application.id } })).status,
    ).toBe('WITHDRAWN');
  });

  it('rejects invitation acceptance after the event closes and checks invitation ownership', async () => {
    const f = await fixture(),
      foreign = await fixture();
    const { invitation } = await inviteToEvent(prisma, f.event.id, f.clientId, f.usherId);
    await expect(
      replyToInvitation(prisma, invitation.id, foreign.usherId, 'ACCEPTED'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await prisma.event.update({ where: { id: f.event.id }, data: { status: 'CANCELLED' } });
    await expect(
      replyToInvitation(prisma, invitation.id, f.usherId, 'ACCEPTED'),
    ).rejects.toMatchObject({ code: 'EVENT_LOCKED' });
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status,
    ).toBe('SENT');
  });

  it('reopens a future fully staffed event atomically with its terminal refund', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    await prisma.$transaction((tx) => holdOrder(tx, out.orderId, out.reference), TX);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe(
      'FULLY_STAFFED',
    );
    await prisma.$transaction(async (tx) => {
      await cancelBooking(tx, out.bookingIds[0]!);
      await refundBooking(tx, out.bookingIds[0]!, 10000);
      expect((await tx.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe('OPEN');
    }, TX);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: out.bookingIds[0]! } })).status,
    ).toBe('REFUNDED');
  });

  it('time sweep completes empty and early-completed events only after their end', async () => {
    const empty = await fixture(),
      paid = await fixture();
    const out = await confirmBatch(paid.deps, paid.params);
    await prisma.$transaction((tx) => holdOrder(tx, out.orderId, out.reference), TX);
    await prisma.$transaction(async (tx) => {
      await markCheckedIn(tx, out.bookingIds[0]!, 'OTP');
      await completeBookingHeld(tx, out.bookingIds[0]!, 'OTP');
    }, TX);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: paid.event.id } })).status).toBe(
      'FULLY_STAFFED',
    );
    await autoComplete(new Date('2030-06-01T09:00:00Z'));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: empty.event.id } })).status).toBe(
      'IN_PROGRESS',
    );
    await autoComplete(new Date('2030-06-01T17:00:00Z'));
    for (const id of [empty.event.id, paid.event.id])
      expect((await prisma.event.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
  });

  it('re-reads a check-in that wins the lifecycle lock before auto-completion', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    const bookingId = out.bookingIds[0]!;
    await prisma.$transaction((tx) => holdOrder(tx, out.orderId, out.reference), TX);
    await prisma.booking.update({
      where: { id: bookingId },
      data: { arrivalAssertedAt: new Date() },
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => {
      locked = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      await lockBookingLifecycle(tx, bookingId);
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      locked(row!.pid);
      await gate;
      await markCheckedIn(tx, bookingId, 'OTP');
    }, TX);
    const pid = await ready;
    const pending = autoComplete(new Date('2030-06-01T18:01:00Z'));
    // Attach rejection handling before releasing the competing transaction.
    const result = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
        const rows = await prisma.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        waiting = rows[0]?.waiting === true;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await holder;
    }
    const settled = await result;
    if ('error' in settled) throw settled.error;
    expect(settled.value.completed).toContain(bookingId);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      'COMPLETED',
    );
    expect((await prisma.payment.findUniqueOrThrow({ where: { bookingId } })).escrowStatus).toBe(
      'HELD',
    );
  });

  it('a reserved refund skips payout without starving completion of an unrelated empty event', async () => {
    const f = await fixture(),
      empty = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    const bookingId = out.bookingIds[0]!;
    await prisma.$transaction((tx) => holdOrder(tx, out.orderId, out.reference), TX);
    await prisma.booking.update({
      where: { id: bookingId },
      data: { arrivalAssertedAt: new Date() },
    });
    await prisma.paymentOperation.create({
      data: {
        kind: 'BOOKING_REFUND',
        dedupeKey: `BOOKING_REFUND:${bookingId}`,
        payload: {
          bookingId,
          amountKobo: 10000,
          precursor: 'CANCEL',
          chargeReference: out.reference,
        },
      },
    });
    const result = await autoComplete(new Date('2030-06-01T18:01:00Z'));
    expect(result.completed).not.toContain(bookingId);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      'CONFIRMED',
    );
    expect((await prisma.event.findUniqueOrThrow({ where: { id: empty.event.id } })).status).toBe(
      'COMPLETED',
    );
  });

  it('repairs legacy future fully staffed events whose bookings already vacated their slots', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    // Historical writer bypassed staffing recomputation; reproduce its persisted state.
    await prisma.booking.update({
      where: { id: out.bookingIds[0]! },
      data: { status: 'CANCELLED' },
    });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe(
      'FULLY_STAFFED',
    );
    await autoComplete(new Date('2030-05-01T00:00:00Z'));
    expect((await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe(
      'OPEN',
    );
  });
});
