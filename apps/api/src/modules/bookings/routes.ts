import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import {
  checkinVerifySchema,
  createReviewSchema,
  cancelBookingSchema,
  eventInstant,
  cancelWindow,
  policyForCancellation,
} from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import {
  generateCheckin,
  verifyCheckin,
  assertArrival,
  completeBooking,
  openDispute,
  createReview,
  cancelBookingByClient,
  cancelBookingByUsher,
} from './service.js';
import { listMessages, sendMessage, unreadCount, markSeen } from '../../realtime/messages.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { RT } from '../../realtime/events.js';
import { serializeEventVenue, venueUnlockedEventIds } from '../events/venue.js';
import { chatMessageBody, seenMessageBody } from '../../realtime/validation.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

export function bookingsRouter(deps: {
  realtime: RealtimeGateway;
  paystack?: PaystackPort | undefined;
}): Router {
  const r = Router();
  r.use(requireAuth);

  // list — usher sees own; client sees bookings on own events
  r.get(
    '/bookings',
    wrap(async (req, res) => {
      // Enrich with the event + counterparty identity so the mobile booking
      // lists (usher upcoming jobs, messages, event-day roster) show real names.
      const include = {
        conversation: {
          select: {
            _count: {
              select: { messages: { where: { senderId: { not: req.auth.userId }, seenAt: null } } },
            },
          },
        },
        reviews: {
          where: { reviewerId: req.auth.userId },
          select: { id: true, rating: true, comment: true },
        },
        event: {
          select: {
            title: true,
            eventDate: true,
            startTime: true,
            endTime: true,
            venue: true,
            client: { select: { displayName: true } },
          },
        },
        usher: { select: { displayName: true, user: { select: { phone: true } } } },
      } as const;
      if (req.auth.role === 'USHER') {
        const usher = await prisma.usher.findFirstOrThrow({ where: { userId: req.auth.userId } });
        const bookings = await prisma.booking.findMany({
          where: { usherId: usher.id },
          orderBy: { createdAt: 'desc' },
          include,
        });
        const unlocked = await venueUnlockedEventIds(
          usher.id,
          bookings.map((booking) => booking.eventId),
        );
        res.json(
          bookings.map(({ conversation, ...booking }) => ({
            ...booking,
            unreadCount: conversation?._count.messages ?? 0,
            myReview: booking.reviews[0] ?? null,
            event: serializeEventVenue(booking.event, {
              role: 'USHER',
              hasConfirmedBooking: unlocked.has(booking.eventId),
            }),
          })),
        );
        return;
      }
      const client = await prisma.client.findFirstOrThrow({ where: { userId: req.auth.userId } });
      const bookings = await prisma.booking.findMany({
        where: { event: { clientId: client.id } },
        orderBy: { createdAt: 'desc' },
        include,
      });
      res.json(
        bookings.map(({ conversation, ...booking }) => ({
          ...booking,
          unreadCount: conversation?._count.messages ?? 0,
          myReview: booking.reviews[0] ?? null,
          event: serializeEventVenue(booking.event, { role: 'CLIENT' }),
        })),
      );
    }),
  );

  r.get(
    '/bookings/:id',
    wrap(async (req, res) => {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: {
          event: { include: { client: true } },
          usher: true,
          payment: true,
          reviews: {
            where: { reviewerId: req.auth.userId },
            select: { id: true, rating: true, comment: true },
          },
          disputes: {
            select: {
              id: true,
              reason: true,
              note: true,
              status: true,
              resolution: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      const uid = req.auth.userId;
      if (booking.event.client.userId !== uid && booking.usher.userId !== uid) {
        throw new ApiError(403, 'FORBIDDEN', 'not your booking');
      }
      const refund = await prisma.paymentOperation.findUnique({
        where: { dedupeKey: `BOOKING_REFUND:${booking.id}` },
        select: { id: true, status: true, providerRef: true, createdAt: true, updatedAt: true },
      });
      if (booking.event.client.userId === uid) {
        res.json({
          ...booking,
          refund,
          myReview: booking.reviews[0] ?? null,
          event: serializeEventVenue(booking.event, { role: 'CLIENT' }),
        });
        return;
      }
      const unlocked = await venueUnlockedEventIds(booking.usherId, [booking.eventId]);
      res.json({
        ...booking,
        refund,
        myReview: booking.reviews[0] ?? null,
        event: serializeEventVenue(booking.event, {
          role: 'USHER',
          hasConfirmedBooking: unlocked.has(booking.eventId),
        }),
      });
    }),
  );

  r.get(
    '/bookings/:id/cancellation-quote',
    wrap(async (req, res) => {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { event: { include: { client: true } }, usher: true },
      });
      const uid = req.auth.userId;
      if (booking.event.client.userId !== uid && booking.usher.userId !== uid)
        throw new ApiError(403, 'FORBIDDEN', 'not your booking');
      const actor = booking.usher.userId === uid ? 'USHER' : 'CLIENT';
      const window = cancelWindow(
        eventInstant(booking.event.eventDate, booking.event.startTime),
        new Date(),
      );
      const outcome = policyForCancellation(actor, window);
      res.json({
        actor,
        window,
        ...outcome,
        gross: booking.amount,
        eligible: booking.status === 'CONFIRMED',
        selfServe: booking.status === 'CONFIRMED' && outcome.clientRefundPct === 100,
        quotedAt: new Date().toISOString(),
      });
    }),
  );

  // client generates an attendance code
  r.post(
    '/bookings/:id/checkin/generate',
    wrap(async (req, res) => {
      const out = await generateCheckin(String(req.params.id), req.auth.userId);
      res.json({ generated: true, ...out });
    }),
  );

  // usher submits the code
  r.post(
    '/bookings/:id/checkin/verify',
    wrap(async (req, res) => {
      const { code } = checkinVerifySchema.parse(req.body);
      await verifyCheckin(String(req.params.id), req.auth.userId, code, deps.realtime);
      res.json({ status: 'CHECKED_IN' });
    }),
  );

  // usher self-asserts arrival (D1)
  r.post(
    '/bookings/:id/arrived',
    wrap(async (req, res) => {
      await assertArrival(String(req.params.id), req.auth.userId);
      res.json({ arrived: true });
    }),
  );

  // client confirms completion → release payout to wallet (★ idempotency key
  // required for consistency with all other money-mutating routes; the ledger
  // itself already guards against double-release via FOR UPDATE + state machine).
  r.post(
    '/bookings/:id/complete',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      await completeBooking(String(req.params.id), req.auth.userId, deps.realtime);
      res.json({ status: 'PAID' });
    }),
  );

  // open a dispute → freeze escrow
  r.post(
    '/bookings/:id/disputes',
    wrap(async (req, res) => {
      const { reason, note } = z
        .object({ reason: z.string().min(3).max(200), note: z.string().max(2000).optional() })
        .parse(req.body);
      const out = await openDispute(
        String(req.params.id),
        req.auth.userId,
        reason,
        note,
        deps.realtime,
      );
      res.status(201).json(out);
    }),
  );

  // review the counterparty after payout
  r.post(
    '/bookings/:id/reviews',
    wrap(async (req, res) => {
      const body = createReviewSchema.parse(req.body);
      const out = await createReview(
        String(req.params.id),
        req.auth.userId,
        body.rating,
        body.comment,
      );
      res.status(201).json(out);
    }),
  );

  // ★ cancel a confirmed booking (policy-driven refund of escrow). Role-aware:
  // an usher cancelling always refunds the client 100% and takes a reputation hit;
  // a client cancellation follows the windowed client matrix (PRD §13).
  r.post(
    '/bookings/:id/cancel',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      cancelBookingSchema.parse(req.body ?? {});
      if (!deps.paystack)
        throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'payments are not configured');
      const ledgerDeps = { prisma, paystack: deps.paystack, realtime: deps.realtime };
      const out =
        req.auth.role === 'USHER'
          ? await cancelBookingByUsher(
              ledgerDeps,
              String(req.params.id),
              req.auth.userId,
              deps.realtime,
            )
          : await cancelBookingByClient(
              ledgerDeps,
              String(req.params.id),
              req.auth.userId,
              deps.realtime,
            );
      res.json(out);
    }),
  );

  // booking chat (REST; realtime is Socket.IO) — party-only, unlocks once CONFIRMED
  r.get(
    '/bookings/:id/messages',
    wrap(async (req, res) => {
      res.json(await listMessages(String(req.params.id), req.auth.userId));
    }),
  );
  r.post(
    '/bookings/:id/messages',
    wrap(async (req, res) => {
      const { content, contentType } = chatMessageBody.parse(req.body);
      const msg = await sendMessage({
        bookingId: String(req.params.id),
        senderId: req.auth.userId,
        content,
        ...(contentType ? { contentType } : {}),
      });
      // Broadcast so socket-connected peers get the REST-sent message in realtime too.
      deps.realtime.emitToBooking(msg.bookingId, RT.MESSAGE_NEW, msg);
      deps.realtime.emitToUser(msg.recipientUserId, RT.CONVERSATION_UNREAD, {
        bookingId: msg.bookingId,
        from: msg.senderId,
      });
      res.status(201).json(msg);
    }),
  );

  // unread count for a booking (inbox badge)
  r.get(
    '/bookings/:id/messages/unread',
    wrap(async (req, res) => {
      res.json({ unread: await unreadCount(String(req.params.id), req.auth.userId) });
    }),
  );

  // mark the counterparty's messages as seen (read receipts)
  r.post(
    '/bookings/:id/messages/seen',
    wrap(async (req, res) => {
      const { upToMessageId } = seenMessageBody.parse(req.body ?? {});
      const seen = await markSeen(String(req.params.id), req.auth.userId, upToMessageId);
      deps.realtime.emitToBooking(String(req.params.id), RT.MESSAGE_SEEN, {
        bookingId: String(req.params.id),
        userId: req.auth.userId,
        at: new Date().toISOString(),
      });
      res.json({ seen });
    }),
  );

  return r;
}
