/**
 * Events, applications, invitations, and confirm-batch (TRD §7/§24, PRD §7).
 * Both hiring models converge: accepting an invitation yields an ACCEPTED
 * application, so confirm-batch has a single input shape.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { createEventSchema } from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import { confirmBatch } from '../bookings/service.js';
import type { Deps } from '../payments/service.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

async function clientFor(userId: string): Promise<string> {
  const c = await prisma.client.findFirst({ where: { userId } });
  if (!c) throw new ApiError(403, 'NOT_A_CLIENT', 'only clients do this');
  return c.id;
}
async function verifiedUsherFor(userId: string): Promise<string> {
  const u = await prisma.usher.findFirst({ where: { userId } });
  if (!u) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers do this');
  if (u.verificationStatus !== 'VERIFIED') throw new ApiError(403, 'NOT_VERIFIED', 'verification required');
  return u.id;
}

export function eventsRouter(deps: Deps): Router {
  const r = Router();
  r.use(requireAuth);

  // create event (client)
  r.post(
    '/events',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const b = createEventSchema.parse(req.body);
      const event = await prisma.event.create({
        data: {
          clientId,
          title: b.title,
          venue: b.venue,
          category: b.category,
          eventDate: b.eventDate,
          startTime: b.startTime,
          endTime: b.endTime,
          headcount: b.headcount,
          budgetPerHead: b.budgetPerHeadKobo,
          dressCode: b.dressCode ?? null,
          accommodation: b.accommodation ?? null,
          ...(b.requirements ? { preferences: { requirements: b.requirements } } : {}),
          status: 'OPEN',
        },
      });
      res.status(201).json(event);
    }),
  );

  // list events — clients see own, ushers see OPEN
  r.get(
    '/events',
    wrap(async (req, res) => {
      if (req.auth.role === 'USHER') {
        const events = await prisma.event.findMany({
          where: { status: { in: ['OPEN', 'PARTIALLY_STAFFED'] } },
          orderBy: { eventDate: 'asc' },
        });
        res.json(events);
        return;
      }
      const clientId = await clientFor(req.auth.userId);
      res.json(await prisma.event.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } }));
    }),
  );

  r.get(
    '/events/:id',
    wrap(async (req, res) => {
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { _count: { select: { applications: true, bookings: true } } },
      });
      res.json(event);
    }),
  );

  // usher applies
  r.post(
    '/events/:id/apply',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const eventId = String(req.params.id);
      const app = await prisma.application.upsert({
        where: { eventId_usherId: { eventId, usherId } },
        update: { status: 'APPLIED' },
        create: { eventId, usherId, status: 'APPLIED' },
      });
      res.status(201).json(app);
    }),
  );

  // client lists applications for own event
  r.get(
    '/events/:id/applications',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const eventId = String(req.params.id);
      const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      if (event.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
      res.json(
        await prisma.application.findMany({
          where: { eventId },
          // Surface more-accomplished (badged) ushers first, then higher-rated.
          orderBy: [
            { usher: { completedJobsCount: 'desc' } },
            { usher: { ratingAvg: 'desc' } },
          ],
          include: { usher: { include: { user: { select: { phone: true } } } } },
        }),
      );
    }),
  );

  // client updates an application (shortlist / accept / reject)
  r.patch(
    '/applications/:id',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const { status } = z
        .object({ status: z.enum(['SHORTLISTED', 'ACCEPTED', 'REJECTED']) })
        .parse(req.body);
      const app = await prisma.application.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { event: true },
      });
      if (app.event.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
      const updated = await prisma.application.update({ where: { id: app.id }, data: { status } });
      res.json(updated);
    }),
  );

  // client invites an usher
  r.post(
    '/events/:id/invite',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const eventId = String(req.params.id);
      const { usherId } = z.object({ usherId: z.string().uuid() }).parse(req.body);
      const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
      if (event.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
      const inv = await prisma.invitation.upsert({
        where: { eventId_usherId: { eventId, usherId } },
        update: { status: 'SENT' },
        create: { eventId, usherId, status: 'SENT' },
      });
      res.status(201).json(inv);
    }),
  );

  // usher accepts/declines invite — ACCEPTED becomes an ACCEPTED application
  r.patch(
    '/invitations/:id',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const { status } = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).parse(req.body);
      const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: String(req.params.id) } });
      if (inv.usherId !== usherId) throw new ApiError(403, 'FORBIDDEN', 'not your invitation');
      await prisma.invitation.update({ where: { id: inv.id }, data: { status } });
      if (status === 'ACCEPTED') {
        await prisma.application.upsert({
          where: { eventId_usherId: { eventId: inv.eventId, usherId } },
          update: { status: 'ACCEPTED' },
          create: { eventId: inv.eventId, usherId, status: 'ACCEPTED' },
        });
      }
      res.json({ status });
    }),
  );

  // ★ confirm a batch → order + bookings + Paystack charge
  r.post(
    '/events/:id/confirm',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      const { applicationIds, email } = z
        .object({ applicationIds: z.array(z.string().uuid()).min(1).max(50), email: z.string().email() })
        .parse(req.body);
      const out = await confirmBatch(deps, {
        clientUserId: req.auth.userId,
        eventId: String(req.params.id),
        applicationIds,
        email,
      });
      res.status(201).json(out);
    }),
  );

  return r;
}
