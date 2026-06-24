/**
 * Booking lifecycle (TRD §7/§8/§12). Confirm-batch creates the order + bookings
 * then initializes the Paystack charge; the charge.success webhook (Phase 2)
 * holds them into escrow. Attendance → completion releases payout to the wallet.
 * Auto-complete / no-show implement the D1 windows.
 */
import { prisma, Prisma, type AttendanceMethod } from '@hq/database';
import {
  DEFAULT_GRACE_MINUTES,
  kobo,
  cancelWindow,
  policyForCancellation,
  type PolicyOutcome,
} from '@hq/shared';
import { ApiError } from '../../app.js';
import {
  notifyPayoutReleased,
  notifyDisputeOpened,
  notifyMilestoneUnlocked,
} from '../notifications/service.js';
import { generateOtp, hashOtp } from '../auth/hash.js';
import {
  releaseBooking,
  freezeBooking,
  markCheckedIn,
} from '../payments/ledger/ledger.js';
import { initChargeForOrder, refundBookingToClient, type Deps } from '../payments/service.js';
import { runIdempotent } from '../payments/ledger/idempotency.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { RT, bookingEvent } from '../../realtime/events.js';

const TX = { timeout: 30_000, maxWait: 30_000 };

/** Push a booking lifecycle event to both parties (and optionally the admin feed). */
function emitBooking(
  realtime: RealtimeGateway,
  parties: { clientUserId: string; usherUserId: string },
  event: string,
  bookingId: string,
  status: string,
  toAdmins = false,
): void {
  const payload = bookingEvent(bookingId, status);
  realtime.emitToUser(parties.clientUserId, event, payload);
  realtime.emitToUser(parties.usherUserId, event, payload);
  if (toAdmins) realtime.emitToAdmins(event, payload);
}

/** Combine an event's date (UTC midnight) with an "HH:MM" time into a Date. */
// Event wall-clock times are Lagos local (WAT = UTC+1, no DST). Convert to the
// real UTC instant so no-show / auto-complete / cancellation windows fire at the
// right moment — otherwise 18:00 Lagos was being treated as 18:00Z (an hour late).
const LAGOS_UTC_OFFSET_HOURS = 1;
function combine(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setUTCHours((h ?? 0) - LAGOS_UTC_OFFSET_HOURS, m ?? 0, 0, 0);
  return d;
}

export async function confirmBatch(
  deps: Deps,
  params: {
    idempotencyKey: string;
    clientUserId: string;
    eventId: string;
    applicationIds: string[];
    email: string;
  },
): Promise<{ orderId: string; authorizationUrl: string; reference: string; bookingIds: string[]; duplicate: boolean }> {
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
  // Idempotent on order_id scope (TRD §10): a retry with the same Idempotency-Key
  // produces exactly one order + booking set. The existing-booking guard inside
  // the tx stops a *different* key from re-confirming the same applicants.
  const { duplicate, result } = await runIdempotent(deps.prisma, params.idempotencyKey, 'order', async (tx) => {
    // Serialize confirmations for this event so two concurrent batches can't both
    // pass the headcount check and overbook (mirrors the ledger's FOR UPDATE row
    // locks). Prisma has no native row-lock API, hence raw SQL.
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id}::uuid FOR UPDATE`;

    const already = await tx.booking.findFirst({
      where: {
        eventId: event.id,
        usherId: { in: apps.map((a) => a.usherId) },
        status: { notIn: ['CANCELLED', 'REFUNDED', 'NO_SHOW'] },
      },
    });
    if (already) throw new ApiError(409, 'ALREADY_CONFIRMED', 'one or more applicants are already booked for this event');

    // Enforce the event's headcount — never confirm more staff than requested.
    const liveCount = await tx.booking.count({
      where: { eventId: event.id, status: { notIn: ['CANCELLED', 'REFUNDED', 'NO_SHOW'] } },
    });
    if (liveCount + apps.length > event.headcount) {
      const remaining = Math.max(0, event.headcount - liveCount);
      throw new ApiError(409, 'OVERBOOKED', `event needs ${remaining} more staff; you selected ${apps.length}`);
    }

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
    // Advance the staffing state so the event stops/keeps showing in discovery.
    const total = liveCount + apps.length;
    await tx.event.update({
      where: { id: event.id },
      data: { status: total >= event.headcount ? 'FULLY_STAFFED' : 'PARTIALLY_STAFFED' },
    });
    return { orderId: order.id, bookingIds: ids };
  });
  if (duplicate || !result) {
    return { orderId: '', authorizationUrl: '', reference: '', bookingIds: [], duplicate: true };
  }

  const init = await initChargeForOrder(deps, {
    orderId: result.orderId,
    email: params.email,
    clientUserId: params.clientUserId,
  });
  return {
    orderId: result.orderId,
    authorizationUrl: init.authorizationUrl,
    reference: init.reference,
    bookingIds: result.bookingIds,
    duplicate: false,
  };
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

export async function verifyCheckin(
  bookingId: string,
  usherUserId: string,
  code: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { usher: true, event: { include: { client: true } } },
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
  // Check-in is the core of the admin attendance feed (feature #2) + tells the client.
  emitBooking(
    realtime,
    { clientUserId: booking.event.client.userId, usherUserId: booking.usher.userId },
    RT.BOOKING_CHECKED_IN,
    bookingId,
    'CHECKED_IN',
    true,
  );
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

export async function completeBooking(
  bookingId: string,
  clientUserId: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true, payment: true },
  });
  if (booking.event.client.userId !== clientUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CHECKED_IN') throw new ApiError(400, 'NOT_CHECKED_IN', 'booking must be checked in');
  const method: AttendanceMethod = booking.attendanceMethod ?? 'OTP';
  const unlocked = await prisma.$transaction((tx) => releaseBooking(tx, bookingId, method), TX);
  if (booking.payment) notifyPayoutReleased(booking.usher.userId, kobo(booking.payment.usherPayout));
  for (const tier of unlocked) notifyMilestoneUnlocked(booking.usher.userId, tier.name);
  const parties = { clientUserId: booking.event.client.userId, usherUserId: booking.usher.userId };
  emitBooking(realtime, parties, RT.BOOKING_COMPLETED, bookingId, 'COMPLETED');
  emitBooking(realtime, parties, RT.BOOKING_PAID, bookingId, 'PAID');
}

/** D1 auto-complete: arrival/check-in present, event ended + grace, no open dispute. */
export async function autoComplete(
  now: Date = new Date(),
  graceMin = DEFAULT_GRACE_MINUTES,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ completed: string[] }> {
  const candidates = await prisma.booking.findMany({
    where: {
      disputes: { none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
      OR: [{ status: 'CHECKED_IN' }, { status: 'CONFIRMED', arrivalAssertedAt: { not: null } }],
    },
    include: { event: { include: { client: true } }, usher: true, payment: true },
  });
  const completed: string[] = [];
  for (const b of candidates) {
    const end = combine(b.event.eventDate, b.event.endTime);
    if (now.getTime() < end.getTime() + graceMin * 60_000) continue;
    const unlocked = await prisma.$transaction(async (tx) => {
      if (b.status === 'CONFIRMED') await markCheckedIn(tx, b.id, 'AUTO');
      return releaseBooking(tx, b.id, 'AUTO');
    }, TX);
    completed.push(b.id);
    if (b.payment) notifyPayoutReleased(b.usher.userId, kobo(b.payment.usherPayout));
    for (const tier of unlocked) notifyMilestoneUnlocked(b.usher.userId, tier.name);
    const parties = { clientUserId: b.event.client.userId, usherUserId: b.usher.userId };
    emitBooking(realtime, parties, RT.BOOKING_COMPLETED, b.id, 'COMPLETED', true);
    emitBooking(realtime, parties, RT.BOOKING_PAID, b.id, 'PAID');
  }
  return { completed };
}

/** No-show: confirmed, neither verified nor self-asserted by start + grace (§12). */
export async function noShowSweep(
  deps: Deps,
  now: Date = new Date(),
  graceMin = DEFAULT_GRACE_MINUTES,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ noShows: string[] }> {
  const candidates = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', checkedInAt: null, arrivalAssertedAt: null },
    include: { event: { include: { client: true } }, usher: true, payment: true },
  });
  const noShows: string[] = [];
  for (const b of candidates) {
    const start = combine(b.event.eventDate, b.event.startTime);
    if (now.getTime() < start.getTime() + graceMin * 60_000) continue;
    const refundAmount = b.payment?.grossAmount ?? b.amount;
    // Refund the client 100% (§12) — issues the real Paystack refund, then the
    // ledger NO_SHOW + REFUND in one tx.
    await refundBookingToClient(deps, { bookingId: b.id, amountKobo: refundAmount, precursor: 'NO_SHOW' });
    await prisma.usher.update({
      where: { id: b.usherId },
      data: { reliabilityScore: { decrement: 10 } },
    });
    noShows.push(b.id);
    emitBooking(
      realtime,
      { clientUserId: b.event.client.userId, usherUserId: b.usher.userId },
      RT.BOOKING_NO_SHOW,
      b.id,
      'NO_SHOW',
      true,
    );
  }
  return { noShows };
}

export async function openDispute(
  bookingId: string,
  userId: string,
  reason: string,
  note?: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ id: string }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true },
  });
  const clientUserId = booking.event.client.userId;
  const usherUserId = booking.usher.userId;
  if (userId !== clientUserId && userId !== usherUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
  }

  const dispute = await prisma.$transaction(async (tx) => {
    await freezeBooking(tx, bookingId);
    return tx.dispute.create({
      data: { bookingId, raisedById: userId, reason, note: note ?? null, status: 'OPEN' },
    });
  }, TX);
  notifyDisputeOpened(userId === clientUserId ? usherUserId : clientUserId);
  emitBooking(realtime, { clientUserId, usherUserId }, RT.BOOKING_DISPUTED, bookingId, 'DISPUTED', true);
  return { id: dispute.id };
}

/**
 * A party reviews the counterparty after the booking is paid out. Creates the
 * Review and recomputes the reviewee's denormalized ratingAvg/ratingCount in one
 * transaction (one review per reviewer per booking).
 */
export async function createReview(
  bookingId: string,
  reviewerUserId: string,
  rating: number,
  comment?: string,
): Promise<{ id: string }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true },
  });
  const clientUserId = booking.event.client.userId;
  const usherUserId = booking.usher.userId;
  if (reviewerUserId !== clientUserId && reviewerUserId !== usherUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'not a party to this booking');
  }
  if (booking.status !== 'PAID') {
    throw new ApiError(400, 'NOT_COMPLETE', 'can only review a completed (paid) booking');
  }
  const revieweeId = reviewerUserId === clientUserId ? usherUserId : clientUserId;
  // Fast path for the friendly error; the @@unique([bookingId, reviewerId])
  // constraint (caught below) is what actually makes concurrent submits safe —
  // two requests can both pass this check before either inserts.
  const existing = await prisma.review.findFirst({ where: { bookingId, reviewerId: reviewerUserId } });
  if (existing) throw new ApiError(409, 'ALREADY_REVIEWED', 'you already reviewed this booking');

  try {
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: { bookingId, reviewerId: reviewerUserId, revieweeId, rating, comment: comment ?? null },
      });
      const agg = await tx.review.aggregate({ where: { revieweeId }, _avg: { rating: true }, _count: true });
      const ratingAvg = agg._avg.rating ?? 0;
      const ratingCount = agg._count;
      if (revieweeId === usherUserId) {
        await tx.usher.update({ where: { id: booking.usherId }, data: { ratingAvg, ratingCount } });
      } else {
        await tx.client.update({ where: { id: booking.event.clientId }, data: { ratingAvg, ratingCount } });
      }
      return created;
    }, TX);
    return { id: review.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ApiError(409, 'ALREADY_REVIEWED', 'you already reviewed this booking');
    }
    throw e;
  }
}

/**
 * Client cancels a CONFIRMED booking. The cancellation policy matrix (PRD §13)
 * is authoritative. We only execute the money path for full client-refund
 * windows (escrow back to the client, usher unpaid) to keep ledger invariants
 * exact; windows that split payout to the usher return 409 + the computed
 * outcome for support to settle (avoids shipping partial-release money math).
 */
export async function cancelBookingByClient(
  deps: Deps,
  bookingId: string,
  clientUserId: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ status: 'REFUNDED'; outcome: PolicyOutcome }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true, payment: true },
  });
  if (booking.event.client.userId !== clientUserId) throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CONFIRMED') throw new ApiError(400, 'NOT_CONFIRMED', 'only confirmed bookings can be cancelled');

  const start = combine(booking.event.eventDate, booking.event.startTime);
  const outcome = policyForCancellation('CLIENT', cancelWindow(start, new Date()));
  if (outcome.clientRefundPct !== 100) {
    throw new ApiError(409, 'PARTIAL_CANCEL_UNSUPPORTED', 'late cancellation requires support to settle the usher payout');
  }
  const gross = booking.payment?.grossAmount ?? booking.amount;
  // Full client refund: issues the real Paystack refund, then the ledger
  // CANCELLED + REFUND in one tx.
  await refundBookingToClient(deps, { bookingId, amountKobo: gross, precursor: 'CANCEL' });
  emitBooking(
    realtime,
    { clientUserId: booking.event.client.userId, usherUserId: booking.usher.userId },
    RT.BOOKING_CANCELLED,
    bookingId,
    'CANCELLED',
    true,
  );
  return { status: 'REFUNDED', outcome };
}
