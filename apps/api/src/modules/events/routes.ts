/**
 * Events, applications, invitations, and confirm-batch (TRD §7/§24, PRD §7).
 * Both hiring models converge: accepting an invitation yields an ACCEPTED
 * application, so confirm-batch has a single input shape.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@hq/database';
import {
  createEventSchema,
  updateEventSchema,
  type UpdateEventInput,
  accommodationDisclosed,
} from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import { confirmBatch } from '../bookings/service.js';
import { writeAudit } from '../audit.js';
import type { Deps } from '../payments/service.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import { type StoragePort, presignDoc } from '../storage/storage.js';

/**
 * Most of this router (events, applications, saved jobs) is independent of
 * payments; only confirm-batch charges. So the Paystack port is optional and
 * the confirm handler guards on it (503), letting the router mount without a
 * payment port configured.
 */
type EventsDeps = Omit<Deps, 'paystack'> & { paystack?: PaystackPort | undefined };

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
/** Resolve the usher id without the verification gate (for read/save flows). */
async function usherFor(userId: string): Promise<string> {
  const u = await prisma.usher.findFirst({ where: { userId } });
  if (!u) throw new ApiError(403, 'NOT_AN_USHER', 'only ushers do this');
  return u.id;
}

/** Map a validated partial-event payload to a Prisma update (only provided keys). */
function eventUpdateData(b: UpdateEventInput): Prisma.EventUpdateInput {
  const data: Prisma.EventUpdateInput = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.venue !== undefined) data.venue = b.venue;
  if (b.category !== undefined) data.category = b.category;
  if (b.eventDate !== undefined) data.eventDate = b.eventDate;
  if (b.startTime !== undefined) data.startTime = b.startTime;
  if (b.endTime !== undefined) data.endTime = b.endTime;
  if (b.headcount !== undefined) data.headcount = b.headcount;
  if (b.budgetPerHeadKobo !== undefined) data.budgetPerHead = b.budgetPerHeadKobo;
  if (b.dressCode !== undefined) data.dressCode = b.dressCode ?? null;
  if (b.accommodation !== undefined) data.accommodation = b.accommodation ?? null;
  if (b.requirements !== undefined) data.preferences = { requirements: b.requirements };
  return data;
}

export function eventsRouter(deps: EventsDeps, storage?: StoragePort): Router {
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

  // client edits own event — only while OPEN/PARTIALLY_STAFFED with no bookings yet
  r.patch(
    '/events/:id',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const eventId = String(req.params.id);
      const existing = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { _count: { select: { bookings: true } } },
      });
      if (existing.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
      const locked =
        (existing.status !== 'OPEN' && existing.status !== 'PARTIALLY_STAFFED') ||
        existing._count.bookings > 0;
      if (locked) throw new ApiError(409, 'EVENT_LOCKED', 'this event can no longer be edited');

      const b = updateEventSchema.parse(req.body);

      // Accommodation invariant, checked on the merged record (PRD late-night rule).
      const mergedEnd = b.endTime ?? existing.endTime;
      const mergedAccommodation =
        b.accommodation !== undefined ? b.accommodation : existing.accommodation;
      if (!accommodationDisclosed(mergedEnd, mergedAccommodation)) {
        throw new ApiError(400, 'VALIDATION', 'accommodation is required for events ending at or after 22:00');
      }

      const data = eventUpdateData(b);
      const updated = await prisma.event.update({ where: { id: eventId }, data });
      await writeAudit({
        actorId: req.auth.userId,
        action: 'EVENT_UPDATED',
        target: eventId,
        metadata: { fields: Object.keys(data) },
      });
      res.json(updated);
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

  // usher's own applications (the "Applied" tab)
  r.get(
    '/me/applications',
    wrap(async (req, res) => {
      const usherId = await usherFor(req.auth.userId);
      res.json(
        await prisma.application.findMany({
          where: { usherId },
          orderBy: { createdAt: 'desc' },
          include: { event: true },
        }),
      );
    }),
  );

  // usher saves / unsaves a job (the "Saved" tab)
  r.post(
    '/events/:id/save',
    wrap(async (req, res) => {
      const usherId = await usherFor(req.auth.userId);
      const eventId = String(req.params.id);
      const saved = await prisma.savedJob.upsert({
        where: { usherId_eventId: { usherId, eventId } },
        update: {},
        create: { usherId, eventId },
      });
      res.status(201).json({ id: saved.id, saved: true });
    }),
  );
  r.delete(
    '/events/:id/save',
    wrap(async (req, res) => {
      const usherId = await usherFor(req.auth.userId);
      const eventId = String(req.params.id);
      await prisma.savedJob.deleteMany({ where: { usherId, eventId } });
      res.json({ saved: false });
    }),
  );
  r.get(
    '/me/saved-jobs',
    wrap(async (req, res) => {
      const usherId = await usherFor(req.auth.userId);
      const rows = await prisma.savedJob.findMany({
        where: { usherId },
        orderBy: { createdAt: 'desc' },
        include: { event: true },
      });
      res.json(rows.map((s) => s.event));
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
      const apps = await prisma.application.findMany({
        where: { eventId },
        // Surface more-accomplished (badged) ushers first, then higher-rated.
        orderBy: [
          { usher: { completedJobsCount: 'desc' } },
          { usher: { ratingAvg: 'desc' } },
        ],
        // Do NOT include user.phone — contact details stay off-platform until a
        // booking exists (on-platform messaging/safety model). displayName lives
        // on the Usher record and is enough to choose whom to hire.
        include: { usher: true },
      });
      // Presign the applicant's avatar so the client sees a real photo when
      // deciding whom to hire; never leak the raw storage key.
      res.json(
        await Promise.all(
          apps.map(async ({ usher: { avatarKey, ...usher }, ...app }) => ({
            ...app,
            usher: { ...usher, avatarUrl: avatarKey ? await presignDoc(storage, avatarKey) : null },
          })),
        ),
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
      const { paystack } = deps;
      if (!paystack) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'payments are not configured');
      const out = await confirmBatch(
        { ...deps, paystack },
        {
          idempotencyKey: req.idempotencyKey ?? '',
          clientUserId: req.auth.userId,
          eventId: String(req.params.id),
          applicationIds,
          email,
        },
      );
      res.status(out.duplicate ? 200 : 201).json(out);
    }),
  );

  return r;
}
