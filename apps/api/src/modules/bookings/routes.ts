import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { checkinVerifySchema } from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import {
  generateCheckin,
  verifyCheckin,
  assertArrival,
  completeBooking,
  openDispute,
} from './service.js';
import { listMessages, sendMessage } from '../../realtime/messages.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

export function bookingsRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  // list — usher sees own; client sees bookings on own events
  r.get(
    '/bookings',
    wrap(async (req, res) => {
      if (req.auth.role === 'USHER') {
        const usher = await prisma.usher.findFirstOrThrow({ where: { userId: req.auth.userId } });
        res.json(await prisma.booking.findMany({ where: { usherId: usher.id }, orderBy: { createdAt: 'desc' } }));
        return;
      }
      const client = await prisma.client.findFirstOrThrow({ where: { userId: req.auth.userId } });
      res.json(
        await prisma.booking.findMany({
          where: { event: { clientId: client.id } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    }),
  );

  r.get(
    '/bookings/:id',
    wrap(async (req, res) => {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { event: { include: { client: true } }, usher: true, payment: true },
      });
      const uid = req.auth.userId;
      if (booking.event.client.userId !== uid && booking.usher.userId !== uid) {
        throw new ApiError(403, 'FORBIDDEN', 'not your booking');
      }
      res.json(booking);
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
      await verifyCheckin(String(req.params.id), req.auth.userId, code);
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

  // client confirms completion → release payout to wallet
  r.post(
    '/bookings/:id/complete',
    wrap(async (req, res) => {
      await completeBooking(String(req.params.id), req.auth.userId);
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
      const out = await openDispute(String(req.params.id), req.auth.userId, reason, note);
      res.status(201).json(out);
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
      const { content, contentType } = z
        .object({
          content: z.string().min(1).max(4000),
          contentType: z.enum(['TEXT', 'IMAGE', 'VOICE']).optional(),
        })
        .parse(req.body);
      const msg = await sendMessage({
        bookingId: String(req.params.id),
        senderId: req.auth.userId,
        content,
        ...(contentType ? { contentType } : {}),
      });
      res.status(201).json(msg);
    }),
  );

  return r;
}
