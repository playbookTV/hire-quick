/**
 * Booking lifecycle (TRD §7/§8/§12). Confirm-batch creates the order + bookings
 * then initializes the Paystack charge; the charge.success webhook (Phase 2)
 * holds them into escrow. Attendance → completion releases payout to the wallet.
 * Auto-complete / no-show implement the D1 windows.
 */
import { randomUUID } from 'node:crypto';
import { prisma, Prisma, type AttendanceMethod } from '@hq/database';
import {
  DEFAULT_GRACE_MINUTES,
  eventInstant,
  kobo,
  cancelWindow,
  policyForCancellation,
  type PolicyOutcome,
  type ReputationEffect,
  type CheckoutResponse,
} from '@hq/shared';
import { ApiError } from '../../app.js';
import { validateEventValues } from '../events/edit.js';
import {
  assertRecruiting,
  assertStaffEligible,
  lockUsherSchedules,
} from '../events/eligibility.js';
import {
  lockBookingLifecycle,
  refreshEventStaffing,
  VACATED_BOOKING_STATUSES,
} from '../events/staffing.js';
import { writeAudit } from '../audit.js';
import {
  notifyPayoutReleased,
  notifyDisputeOpened,
  notifyMilestoneUnlocked,
} from '../notifications/service.js';
import { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from '../auth/hash.js';
import { releaseBooking, freezeBooking, markCheckedIn } from '../payments/ledger/ledger.js';
import { refundBookingToClient, type Deps } from '../payments/service.js';
import { CHECKOUT_TTL_MS, resumeCheckout } from '../payments/checkout.js';
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

/** 72-hour dispute window after the event ends (PRD §13 / TRD §20). */
const DISPUTE_WINDOW_MS = 72 * 3_600_000;

/** reliabilityScore decrement per reputation tier on an usher cancellation (PRD §13). */
const REPUTATION_PENALTY: Record<ReputationEffect, number> = {
  NONE: 0,
  MINOR_FLAG: 5,
  PENALTY: 15,
  MAJOR_PENALTY: 25,
};

const combine = eventInstant;

export async function confirmBatch(
  deps: Deps,
  params: {
    idempotencyKey: string;
    clientUserId: string;
    eventId: string;
    applicationIds: string[];
    email: string;
  },
): Promise<CheckoutResponse> {
  const applicationIds = [...new Set(params.applicationIds)].sort();
  if (!applicationIds.length || applicationIds.length > 50)
    throw new ApiError(400, 'VALIDATION', 'select between one and fifty applicants');
  const requestFingerprint = JSON.stringify({
    eventId: params.eventId,
    applicationIds,
    email: params.email,
  });
  const { duplicate, result } = await runIdempotent(
    deps.prisma,
    params.idempotencyKey,
    'order',
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${params.eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUniqueOrThrow({
        where: { id: params.eventId },
        include: { client: true },
      });
      if (event.client.userId !== params.clientUserId)
        throw new ApiError(403, 'FORBIDDEN', 'not your event');
      validateEventValues(event);

      // Lock the whole selection before reading eligibility. An application update
      // that won the row lock must be visible; no subset can silently be charged.
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM applications WHERE id IN (${Prisma.join(applicationIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
      const apps = await tx.application.findMany({
        where: { id: { in: applicationIds }, eventId: event.id, status: 'ACCEPTED' },
        orderBy: { id: 'asc' },
      });
      if (apps.length !== applicationIds.length)
        throw new ApiError(
          409,
          'SELECTION_CHANGED',
          'one or more selected applicants are no longer eligible',
        );
      const usherIds = apps.map((a) => a.usherId).sort();
      await lockUsherSchedules(tx, usherIds);
      await assertStaffEligible(tx, event, usherIds);
      const declined = await tx.invitation.findFirst({
        where: {
          eventId: event.id,
          usherId: { in: usherIds },
          status: { in: ['DECLINED', 'EXPIRED'] },
        },
      });
      if (declined)
        throw new ApiError(
          409,
          'SELECTION_CHANGED',
          'one or more invitations are no longer accepted',
        );
      const already = await tx.booking.findFirst({
        where: {
          eventId: event.id,
          usherId: { in: usherIds },
          status: { notIn: VACATED_BOOKING_STATUSES },
        },
      });
      if (already)
        throw new ApiError(
          409,
          'ALREADY_CONFIRMED',
          'one or more applicants are already booked for this event',
        );
      assertRecruiting(event);
      const liveCount = await tx.booking.count({
        where: { eventId: event.id, status: { notIn: VACATED_BOOKING_STATUSES } },
      });
      if (liveCount + apps.length > event.headcount)
        throw new ApiError(
          409,
          'OVERBOOKED',
          `event needs ${Math.max(0, event.headcount - liveCount)} more staff; you selected ${apps.length}`,
        );
      const orderId = randomUUID();
      const reference = `hq-${orderId}`;
      const order = await tx.order.create({
        data: {
          id: orderId,
          clientId: event.clientId,
          eventId: event.id,
          grossAmount: event.budgetPerHead * apps.length,
          status: 'PENDING',
          paystackChargeRef: reference,
          checkout: {
            create: {
              reference,
              email: params.email,
              expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
            },
          },
        },
      });
      const bookingIds: string[] = [];
      for (const a of apps) {
        const booking = await tx.booking.create({
          data: {
            eventId: event.id,
            usherId: a.usherId,
            orderId: order.id,
            amount: event.budgetPerHead,
            status: 'PENDING_PAYMENT',
          },
        });
        bookingIds.push(booking.id);
      }
      await refreshEventStaffing(tx, event.id);
      return { orderId: order.id, bookingIds };
    },
    {
      callerId: params.clientUserId,
      requestFingerprint,
      legacyReplay: async (tx, saved) => {
        if (!saved?.orderId) return false;
        const legacy = await tx.order.findUnique({
          where: { id: saved.orderId },
          include: { client: true },
        });
        if (!legacy || legacy.client.userId !== params.clientUserId) return false;
        // Historical responses omitted the checkout email/request fingerprint.
        // Never guess a match, disclose another result, or create a second order.
        throw new ApiError(
          409,
          'LEGACY_IDEMPOTENCY_CONFLICT',
          'reopen the existing order to resume this checkout',
        );
      },
    },
  );
  if (!result?.orderId || !Array.isArray(result.bookingIds))
    throw new ApiError(
      500,
      'CHECKOUT_OUTCOME_UNAVAILABLE',
      'checkout outcome is unavailable; retry with the same key',
    );

  const checkout = await resumeCheckout(
    deps,
    { orderId: result.orderId, clientUserId: params.clientUserId, email: params.email },
    duplicate,
  );
  if (checkout.eventId !== params.eventId)
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'checkout does not match this request');
  return checkout;
}

export async function generateCheckin(
  bookingId: string,
  clientUserId: string,
): Promise<{ code: string; expiresAt: string }> {
  return prisma.$transaction(async (tx) => {
    await lockBookingLifecycle(tx, bookingId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { event: { include: { client: true } } },
    });
    if (booking.event.client.userId !== clientUserId)
      throw new ApiError(403, 'FORBIDDEN', 'not your booking');
    if (booking.status !== 'CONFIRMED')
      throw new ApiError(400, 'NOT_CONFIRMED', 'booking is not confirmed');
    const now = new Date();
    await tx.verificationCode.updateMany({
      where: { purpose: 'ATTENDANCE', subjectRef: bookingId, consumedAt: null },
      data: { expiresAt: now },
    });
    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const binding = { purpose: 'ATTENDANCE' as const, subjectRef: bookingId, id: randomUUID() };
    await tx.verificationCode.create({
      data: { ...binding, codeHash: hashOtp(code, binding), createdAt: now, expiresAt },
    });
    // The owning client displays this booking-bound code to the arriving usher.
    return { code, expiresAt: expiresAt.toISOString() };
  }, TX);
}

export async function verifyCheckin(
  bookingId: string,
  usherUserId: string,
  code: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const outcome = await prisma.$transaction(async (tx) => {
    await lockBookingLifecycle(tx, bookingId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { usher: true, event: { include: { client: true } } },
    });
    if (booking.usher.userId !== usherUserId)
      throw new ApiError(403, 'FORBIDDEN', 'not your booking');
    const now = new Date();
    const rec = await tx.verificationCode.findFirst({
      where: {
        purpose: 'ATTENDANCE',
        subjectRef: bookingId,
        consumedAt: null,
        expiresAt: { gt: now },
        createdAt: { gt: new Date(now.getTime() - OTP_TTL_MS) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!rec) return { error: new ApiError(400, 'CODE_INVALID', 'invalid attendance code') };
    if (rec.attempts >= OTP_MAX_ATTEMPTS)
      return {
        error: new ApiError(429, 'CODE_LOCKED', 'too many attempts; ask the client for a new code'),
      };
    if (
      !verifyOtpHash(rec.codeHash, code, {
        purpose: 'ATTENDANCE',
        subjectRef: bookingId,
        id: rec.id,
      })
    ) {
      await tx.verificationCode.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      return { error: new ApiError(400, 'CODE_INVALID', 'invalid attendance code') };
    }
    await tx.verificationCode.update({ where: { id: rec.id }, data: { consumedAt: now } });
    // A failed transition or DB write rolls back consumption too, permitting retry.
    await markCheckedIn(tx, bookingId, 'OTP');
    return {
      parties: { clientUserId: booking.event.client.userId, usherUserId: booking.usher.userId },
    };
  }, TX);
  if (outcome.error) throw outcome.error;
  emitBooking(realtime, outcome.parties, RT.BOOKING_CHECKED_IN, bookingId, 'CHECKED_IN', true);
}

export async function assertArrival(bookingId: string, usherUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockBookingLifecycle(tx, bookingId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { usher: true },
    });
    if (booking.usher.userId !== usherUserId)
      throw new ApiError(403, 'FORBIDDEN', 'not your booking');
    if (booking.status !== 'CONFIRMED' && booking.status !== 'CHECKED_IN') {
      throw new ApiError(400, 'BAD_STATE', 'cannot assert arrival now');
    }
    if (!booking.arrivalAssertedAt) {
      await tx.booking.update({
        where: { id: bookingId },
        data: { arrivalAssertedAt: new Date() },
      });
    }
  }, TX);
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
  if (booking.event.client.userId !== clientUserId)
    throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CHECKED_IN')
    throw new ApiError(400, 'NOT_CHECKED_IN', 'booking must be checked in');
  const method: AttendanceMethod = booking.attendanceMethod ?? 'OTP';
  const unlocked = await prisma.$transaction((tx) => releaseBooking(tx, bookingId, method), TX);
  if (booking.payment)
    notifyPayoutReleased(booking.usher.userId, kobo(booking.payment.usherPayout));
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
      await lockBookingLifecycle(tx, b.id);
      const current = await tx.booking.findUniqueOrThrow({
        where: { id: b.id },
        include: { event: true },
      });
      if (
        current.status !== 'CHECKED_IN' &&
        !(current.status === 'CONFIRMED' && current.arrivalAssertedAt)
      )
        return null;
      if (
        now.getTime() <
        combine(current.event.eventDate, current.event.endTime).getTime() + graceMin * 60_000
      )
        return null;
      if (
        await tx.dispute.findFirst({
          where: { bookingId: b.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        })
      )
        return null;
      const refund = await tx.paymentOperation.findUnique({
        where: { dedupeKey: `BOOKING_REFUND:${b.id}` },
      });
      if (refund && refund.status !== 'FAILED') return null;
      if (current.status === 'CONFIRMED') await markCheckedIn(tx, b.id, 'AUTO');
      return releaseBooking(tx, b.id, 'AUTO');
    }, TX);
    if (unlocked === null) continue;
    completed.push(b.id);
    if (b.payment) notifyPayoutReleased(b.usher.userId, kobo(b.payment.usherPayout));
    for (const tier of unlocked) notifyMilestoneUnlocked(b.usher.userId, tier.name);
    const parties = { clientUserId: b.event.client.userId, usherUserId: b.usher.userId };
    emitBooking(realtime, parties, RT.BOOKING_COMPLETED, b.id, 'COMPLETED', true);
    emitBooking(realtime, parties, RT.BOOKING_PAID, b.id, 'PAID');
  }
  // Early payouts and events with no bookings need a time-driven state refresh too.
  let afterId: string | undefined;
  for (;;) {
    const page = await prisma.event.findMany({
      where: {
        ...(afterId ? { id: { gt: afterId } } : {}),
        OR: [
          { status: { in: ['PARTIALLY_STAFFED', 'FULLY_STAFFED'] } },
          {
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            eventDate: { lte: new Date(now.getTime() + 3_600_000) },
          },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    if (!page.length) break;
    for (const event of page)
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id}::uuid FOR UPDATE`;
        await refreshEventStaffing(tx, event.id, now);
      }, TX);
    afterId = page[page.length - 1]!.id;
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
    const refund = await refundBookingToClient(deps, {
      bookingId: b.id,
      amountKobo: refundAmount,
      precursor: 'NO_SHOW',
    });
    if (refund.status !== 'RECORDED') continue;
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
  // SEC-H1: An usher may only raise a dispute after they have checked in.
  // Allowing a dispute on a CONFIRMED (pre-event) booking would freeze escrow
  // before arrival, blocking the automated no-show sweep that would otherwise
  // refund the client 100%. The check is `checkedInAt != null` rather than
  // `status === 'CHECKED_IN'` so the window stays open even after the status
  // advances to COMPLETED during admin resolution.
  if (userId === usherUserId && !booking.checkedInAt) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'you can only raise a dispute after checking in at the event',
    );
  }
  // Enforce the 72-hour dispute window (PRD §13 / TRD §20): disputes are only
  // accepted up to 72h after the event ends. (freezeBooking separately requires
  // funds still HELD, so once a payout completes the window is effectively shorter
  // — the two gates compose rather than conflict.)
  const eventEnd = combine(booking.event.eventDate, booking.event.endTime);
  if (Date.now() > eventEnd.getTime() + DISPUTE_WINDOW_MS) {
    throw new ApiError(
      409,
      'DISPUTE_WINDOW_CLOSED',
      'the 72-hour dispute window for this booking has closed',
    );
  }

  const dispute = await prisma.$transaction(async (tx) => {
    await freezeBooking(tx, bookingId);
    return tx.dispute.create({
      data: { bookingId, raisedById: userId, reason, note: note ?? null, status: 'OPEN' },
    });
  }, TX);
  notifyDisputeOpened(userId === clientUserId ? usherUserId : clientUserId);
  emitBooking(
    realtime,
    { clientUserId, usherUserId },
    RT.BOOKING_DISPUTED,
    bookingId,
    'DISPUTED',
    true,
  );
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
  const existing = await prisma.review.findFirst({
    where: { bookingId, reviewerId: reviewerUserId },
  });
  if (existing) throw new ApiError(409, 'ALREADY_REVIEWED', 'you already reviewed this booking');

  try {
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId,
          reviewerId: reviewerUserId,
          revieweeId,
          rating,
          comment: comment ?? null,
        },
      });
      const agg = await tx.review.aggregate({
        where: { revieweeId },
        _avg: { rating: true },
        _count: true,
      });
      const ratingAvg = agg._avg.rating ?? 0;
      const ratingCount = agg._count;
      if (revieweeId === usherUserId) {
        await tx.usher.update({ where: { id: booking.usherId }, data: { ratingAvg, ratingCount } });
      } else {
        await tx.client.update({
          where: { id: booking.event.clientId },
          data: { ratingAvg, ratingCount },
        });
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
  if (booking.event.client.userId !== clientUserId)
    throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CONFIRMED')
    throw new ApiError(400, 'NOT_CONFIRMED', 'only confirmed bookings can be cancelled');

  const start = combine(booking.event.eventDate, booking.event.startTime);
  const outcome = policyForCancellation('CLIENT', cancelWindow(start, new Date()));
  if (outcome.clientRefundPct !== 100) {
    throw new ApiError(
      409,
      'PARTIAL_CANCEL_UNSUPPORTED',
      'late cancellation requires support to settle the usher payout',
    );
  }
  const gross = booking.payment?.grossAmount ?? booking.amount;
  // Full client refund: issues the real Paystack refund, then the ledger
  // CANCELLED + REFUND in one tx.
  const refund = await refundBookingToClient(deps, {
    bookingId,
    amountKobo: gross,
    precursor: 'CANCEL',
  });
  if (refund.status !== 'RECORDED') {
    throw new ApiError(
      409,
      'REFUND_PENDING',
      'refund is awaiting provider confirmation; do not submit a new payment',
    );
  }
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

/**
 * Usher cancels a CONFIRMED booking (PRD §13). Every usher-cancel window refunds
 * the client 100%, so the money path is always the full refund (no partial-release
 * math). The usher's reliabilityScore is docked per the reputation tier, and a
 * repeat late (<12h) canceller is suspended. Repeat detection reads the audit
 * trail so a client-initiated cancellation never counts against the usher.
 */
export async function cancelBookingByUsher(
  deps: Deps,
  bookingId: string,
  usherUserId: string,
  realtime: RealtimeGateway = noopGateway,
): Promise<{ status: 'REFUNDED'; outcome: PolicyOutcome }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: { include: { client: true } }, usher: true, payment: true },
  });
  if (booking.usher.userId !== usherUserId)
    throw new ApiError(403, 'FORBIDDEN', 'not your booking');
  if (booking.status !== 'CONFIRMED')
    throw new ApiError(400, 'NOT_CONFIRMED', 'only confirmed bookings can be cancelled');

  const start = combine(booking.event.eventDate, booking.event.startTime);
  const window = cancelWindow(start, new Date());
  const outcome = policyForCancellation('USHER', window);
  const gross = booking.payment?.grossAmount ?? booking.amount;
  const refund = await refundBookingToClient(deps, {
    bookingId,
    amountKobo: gross,
    precursor: 'CANCEL',
  });
  if (refund.status !== 'RECORDED') {
    throw new ApiError(
      409,
      'REFUND_PENDING',
      'refund is awaiting provider confirmation; do not submit a new payment',
    );
  }

  // RC-M1: Wrap reputation penalty + suspension check in a single transaction.
  // Previously these were three separate writes; a crash between them could
  // leave the score decremented without the usher being suspended, or suspend
  // without the prior audit entry existing for the count. The audit write
  // (writeAudit) maintains a hash-chain with its own serialization lock, so it
  // cannot be nested inside another $transaction — it runs after the core tx.
  const penalty = REPUTATION_PENALTY[outcome.usherReputation];
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${usherUserId}::uuid FOR UPDATE`;
    if (penalty > 0) {
      await tx.usher.update({
        where: { id: booking.usherId },
        data: { reliabilityScore: { decrement: penalty } },
      });
    }
    if (outcome.suspendIfRepeat) {
      // Count prior late-cancel entries already committed (committed data visible
      // within this tx because READ COMMITTED is the default isolation level).
      const priorUsherCancels = await tx.auditLog.count({
        where: { actorId: usherUserId, action: 'booking.cancel.usher', target: { not: bookingId } },
      });
      if (priorUsherCancels > 0) {
        await tx.user.update({ where: { id: usherUserId }, data: { status: 'SUSPENDED' } });
      }
    }
  }, TX);
  // Audit write has its own hash-chain transaction and cannot nest.
  await writeAudit({
    actorId: usherUserId,
    action: 'booking.cancel.usher',
    target: bookingId,
    metadata: { window, reputation: outcome.usherReputation },
  });

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
