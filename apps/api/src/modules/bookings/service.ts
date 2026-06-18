/**
 * Booking lifecycle (TRD §7/§8/§12). Confirm-batch creates the order + bookings
 * then initializes the Paystack charge; the charge.success webhook (Phase 2)
 * holds them into escrow. Attendance → completion releases payout to the wallet.
 * Auto-complete / no-show implement the D1 windows.
 */
import { prisma, type AttendanceMethod } from '@hq/database';
import { DEFAULT_GRACE_MINUTES } from '@hq/shared';
import { ApiError } from '../../app.js';
import { generateOtp, hashOtp } from '../auth/hash.js';
import {
  releaseBooking,
  refundBooking,
  freezeBooking,
  markNoShow,
  markCheckedIn,
} from '../payments/ledger/ledger.js';
import { initChargeForOrder, type Deps } from '../payments/service.js';

const TX = { timeout: 30_000, maxWait: 30_000 };

/** Combine an event's date (UTC midnight) with an "HH:MM" time into a Date. */
function combine(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export async function confirmBatch(
  deps: Deps,
  params: { clientUserId: string; eventId: string; applicationIds: string[]; email: string },
): Promise<{ orderId: string; authorizationUrl: string; reference: string; bookingIds: string[] }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
    include: { client: true },
  });
  if (event.client.userId !== params.clientUserId) throw new ApiError(403, 'FORBIDDEN', 'not your event');

  const apps = await prisma.application.findMany({
    where: { id: { in: params.applicationIds }, eventId: params.eventId, status: 'ACCEPTED' },
  });
  if (apps.length === 0) throw new ApiError(400, 'NO_ACCEPTED', 'no accepted applications to confirm');

  const gross = event.budgetPerHead * apps.length;
  const { orderId, bookingIds } = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { clientId: event.clientId, eventId: event.id, grossAmount: gross, status: 'PENDING' },
    });
    const ids: string[] = [];
    for (const a of apps) {
      const b = await tx.booking.create({
        data: {
          eventId: event.id,
          usherId: a.usherId,
          orderId: order.id,
          amount: event.budgetPerHead,
          status: 'PENDING_PAYMENT',
        },
      });
      ids.push(b.id);
    }
    return { orderId: order.id, bookingIds: ids };
  }, TX);

  const init = await initChargeForOrder(deps, { orderId, email: params.email });
  return { orderId, authorizationUrl: init.authorizationUrl, reference: init.reference, bookingIds };
}

export async function generateCheckin(
  bookingId: string,
  clientUserId: string,
): Promise<{ devCode?: string }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } } },
  });
  if (booking.event.client.userId !== clientUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CONFIRMED') throw new ApiError(400, 'NOT_CONFIRMED', 'booking is not confirmed');

  const code = generateOtp();
  await prisma.verificationCode.create({
    data: {
      purpose: 'ATTENDANCE',
      subjectRef: bookingId,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + 8 * 3_600_000),
    },
  });
  return process.env.NODE_ENV === 'production' ? {} : { devCode: code };
}

export async function verifyCheckin(bookingId: string, usherUserId: string, code: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { usher: true },
  });
  if (booking.usher.userId !== usherUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  const rec = await prisma.verificationCode.findFirst({
    where: { purpose: 'ATTENDANCE', subjectRef: bookingId, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec || rec.codeHash !== hashOtp(code)) {
    if (rec) await prisma.verificationCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, 'CODE_INVALID', 'invalid attendance code');
  }
  await prisma.verificationCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } });
  await prisma.$transaction((tx) => markCheckedIn(tx, bookingId, 'OTP'), TX);
}

export async function assertArrival(bookingId: string, usherUserId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { usher: true },
  });
  if (booking.usher.userId !== usherUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CONFIRMED' && booking.status !== 'CHECKED_IN') {
    throw new ApiError(400, 'BAD_STATE', 'cannot assert arrival now');
  }
  await prisma.booking.update({ where: { id: bookingId }, data: { arrivalAssertedAt: new Date() } });
}

export async function completeBooking(bookingId: string, clientUserId: string): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } } },
  });
  if (booking.event.client.userId !== clientUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CHECKED_IN') throw new ApiError(400, 'NOT_CHECKED_IN', 'booking must be checked in');
  const method: AttendanceMethod = booking.attendanceMethod ?? 'OTP';
  await prisma.$transaction((tx) => releaseBooking(tx, bookingId, method), TX);
}

/** D1 auto-complete: arrival/check-in present, event ended + grace, no open dispute. */
export async function autoComplete(
  now: Date = new Date(),
  graceMin = DEFAULT_GRACE_MINUTES,
): Promise<{ completed: string[] }> {
  const candidates = await prisma.booking.findMany({
    where: {
      disputes: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
      OR: [{ status: 'CHECKED_IN' }, { status: 'CONFIRMED', arrivalAssertedAt: { not: null } }],
    },
    include: { event: true },
  });
  const completed: string[] = [];
  for (const b of candidates) {
    const end = combine(b.event.eventDate, b.event.endTime);
    if (now.getTime() < end.getTime() + graceMin * 60_000) continue;
    await prisma.$transaction(async (tx) => {
      if (b.status === 'CONFIRMED') await markCheckedIn(tx, b.id, 'AUTO');
      await releaseBooking(tx, b.id, 'AUTO');
    }, TX);
    completed.push(b.id);
  }
  return { completed };
}

/** No-show: confirmed, neither verified nor self-asserted by start + grace (§12). */
export async function noShowSweep(
  now: Date = new Date(),
  graceMin = DEFAULT_GRACE_MINUTES,
): Promise<{ noShows: string[] }> {
  const candidates = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', checkedInAt: null, arrivalAssertedAt: null },
    include: { event: true, payment: true },
  });
  const noShows: string[] = [];
  for (const b of candidates) {
    const start = combine(b.event.eventDate, b.event.startTime);
    if (now.getTime() < start.getTime() + graceMin * 60_000) continue;
    const refundAmount = b.payment?.grossAmount ?? b.amount;
    await prisma.$transaction(async (tx) => {
      await markNoShow(tx, b.id);
      await refundBooking(tx, b.id, refundAmount);
    }, TX);
    await prisma.usher.update({
      where: { id: b.usherId },
      data: { reliabilityScore: { decrement: 10 } },
    });
    noShows.push(b.id);
  }
  return { noShows };
}

export async function openDispute(
  bookingId: string,
  userId: string,
  reason: string,
  note?: string,
): Promise<{ id: string }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true },
  });
  const isParty = booking.event.client.userId === userId || booking.usher.userId === userId;
  if (!isParty) throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');

  const dispute = await prisma.$transaction(async (tx) => {
    await freezeBooking(tx, bookingId);
    return tx.dispute.create({
      data: { bookingId, raisedById: userId, reason, note: note ?? null, status: 'OPEN' },
    });
  }, TX);
  return { id: dispute.id };
}
