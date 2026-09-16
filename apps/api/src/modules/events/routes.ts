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
} from '@hq/shared';
import { ApiError } from '../../app.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { requireIdempotencyKey } from '../payments/http/middleware.js';
import { confirmBatch } from '../bookings/service.js';
import { editEvent } from './edit.js';
import { applyToEvent, selectApplication, inviteToEvent, replyToInvitation } from './recruitment.js';
import { serializeEventVenue, venueUnlockedEventIds } from './venue.js';
import { notifyInvitationReceived, notifyApplicationReceived } from '../notifications/service.js';
import { RT } from '../../realtime/events.js';
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

/** Free-text staff preferences live in the `preferences` JSON blob (no column per field). */
function eventPreferences(b: { requirements?: string | undefined; hairstyle?: string | undefined }): Record<string, string> | undefined {
  const p: Record<string, string> = {};
  if (b.requirements) p.requirements = b.requirements;
  if (b.hairstyle) p.hairstyle = b.hairstyle;
  return Object.keys(p).length > 0 ? p : undefined;
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
      const prefs = eventPreferences(b);
      const event = await prisma.event.create({
        data: {
          clientId,
          title: b.title,
          venue: b.venue,
          state: b.state ?? null,
          category: b.category,
          eventDate: b.eventDate,
          startTime: b.startTime,
          endTime: b.endTime,
          headcount: b.headcount,
          budgetPerHead: b.budgetPerHeadKobo,
          dressCode: b.dressCode ?? null,
          accommodation: b.accommodation ?? null,
          ...(prefs ? { preferences: prefs } : {}),
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
        const usherId = await usherFor(req.auth.userId);
        const me = await prisma.usher.findUnique({ where: { id: usherId }, select: { state: true } });
        // Hard state filter (feedback: Abuja/Enugu ushers shouldn't see Lagos jobs).
        // Untagged events (state: null) stay visible to everyone; ushers with no
        // state set yet see all until they choose one.
        const where: Prisma.EventWhereInput = { status: { in: ['OPEN', 'PARTIALLY_STAFFED'] } };
        if (me?.state) where.OR = [{ state: me.state }, { state: null }];
        const events = await prisma.event.findMany({
          where,
          orderBy: { eventDate: 'asc' },
        });
        // Mask the precise venue per event unless this usher already has escrow
        // held for it (PRD §7/§13) — the detail endpoint does the same.
        const unlocked = await venueUnlockedEventIds(
          usherId,
          events.map((e) => e.id),
        );
        res.json(events.map((e) => serializeEventVenue(e, { role: 'USHER', hasConfirmedBooking: unlocked.has(e.id) })));
        return;
      }
      const clientId = await clientFor(req.auth.userId);
      const events = await prisma.event.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
      res.json(events.map((event) => serializeEventVenue(event, { role: 'CLIENT' })));
    }),
  );

  r.get(
    '/events/:id',
    wrap(async (req, res) => {
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { _count: { select: { applications: true, bookings: true } } },
      });
      const auth = req.auth;
      if (auth.role === 'ADMIN') {
        res.json(serializeEventVenue(event, { role: auth.role }));
        return;
      }
      if (auth.role === 'CLIENT') {
        // A client may read only their own events.
        if (event.clientId !== (await clientFor(auth.userId))) {
          throw new ApiError(404, 'NOT_FOUND', 'event not found');
        }
        res.json(serializeEventVenue(event, { role: auth.role }));
        return;
      }
      // USHER: readable only if the event is discoverable (OPEN/PARTIALLY_STAFFED)
      // or the usher is related to it (applied/booked). Otherwise it does not exist
      // for them — no enumerating arbitrary events by id (PRD §7).
      const usherId = await usherFor(auth.userId);
      const booking = await prisma.booking.findFirst({
        where: { eventId: event.id, usherId },
        select: { status: true },
      });
      const application = await prisma.application.findFirst({
        where: { eventId: event.id, usherId },
        select: { id: true },
      });
      const discoverable = event.status === 'OPEN' || event.status === 'PARTIALLY_STAFFED';
      if (!discoverable && !booking && !application) {
        throw new ApiError(404, 'NOT_FOUND', 'event not found');
      }
      // Withhold the precise venue until escrow is held for this usher — i.e. a
      // CONFIRMED+ booking. Until then they see a masked placeholder (PRD §7/§13:
      // contact-masking + withholding precise venue until escrow is held).
      const unlocked = await venueUnlockedEventIds(usherId, [event.id]);
      res.json(serializeEventVenue(event, { role: 'USHER', hasConfirmedBooking: unlocked.has(event.id) }));
    }),
  );

  // client edits own event — only while OPEN/PARTIALLY_STAFFED with no bookings yet
  r.patch(
    '/events/:id',
    wrap(async (req, res) => {
      const clientId = await clientFor(req.auth.userId);
      const eventId = String(req.params.id);
      const updated = await editEvent(deps.prisma, clientId, req.auth.userId, eventId, req.body);
      res.json(updated);
    }),
  );

  // usher applies
  r.post(
    '/events/:id/apply',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const eventId = String(req.params.id);
      const { application: app, notify } = await applyToEvent(deps.prisma, eventId, usherId);
      res.status(201).json(app);

      if (notify) {
        const event = await prisma.event.findUnique({
          where: { id: eventId },
          select: { title: true, client: { select: { userId: true } } },
        });
        if (event?.client?.userId) {
          const usher = await prisma.usher.findUnique({ where: { id: usherId }, select: { displayName: true } });
          notifyApplicationReceived(event.client.userId, event.title, eventId, usher?.displayName ?? undefined);
          deps.realtime?.emitToUser(event.client.userId, RT.APPLICATION_RECEIVED, { eventId });
        }
      }
    }),
  );

  // usher's own applications (the "Applied" tab)
  r.get(
    '/me/applications',
    wrap(async (req, res) => {
      const usherId = await usherFor(req.auth.userId);
      const apps = await prisma.application.findMany({
        where: { usherId },
        orderBy: { createdAt: 'desc' },
        include: { event: true },
      });
      // Applying does not unlock the precise venue — only an escrow-held booking
      // does (PRD §7/§13), same rule as discovery.
      const unlocked = await venueUnlockedEventIds(
        usherId,
        apps.map((a) => a.eventId),
      );
      res.json(apps.map((a) => ({ ...a, event: serializeEventVenue(a.event, { role: 'USHER', hasConfirmedBooking: unlocked.has(a.eventId) }) })));
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
      const unlocked = await venueUnlockedEventIds(
        usherId,
        rows.map((s) => s.event.id),
      );
      res.json(rows.map((s) => serializeEventVenue(s.event, { role: 'USHER', hasConfirmedBooking: unlocked.has(s.event.id) })));
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
      const updated = await selectApplication(deps.prisma, String(req.params.id), clientId, status);
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
      const { invitation: inv, event, notify } = await inviteToEvent(deps.prisma, eventId, clientId, usherId);
      const usher = await prisma.usher.findUnique({ where: { id: usherId }, select: { userId: true } });
      if (notify && usher) {
        notifyInvitationReceived(usher.userId, event.title, inv.id);
        deps.realtime?.emitToUser(usher.userId, RT.INVITATION_RECEIVED, {
          invitationId: inv.id,
          eventId,
          at: new Date().toISOString(),
        });
      }
      res.status(201).json(inv);
    }),
  );

  // usher lists their own invitations (+ event/client join) for the invites inbox
  r.get(
    '/me/invitations',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const invites = await prisma.invitation.findMany({
        where: { usherId },
        orderBy: { createdAt: 'desc' },
        include: { event: { include: { client: { select: { displayName: true, businessName: true } } } } },
      });
      const unlocked = await venueUnlockedEventIds(usherId, invites.map((inv) => inv.eventId));
      res.json(invites.map((inv) => ({ ...inv, event: serializeEventVenue(inv.event, { role: 'USHER', hasConfirmedBooking: unlocked.has(inv.eventId) }) })));
    }),
  );

  // a single invitation (the usher's own) — hydrates the invitation modal from a deep link
  r.get(
    '/invitations/:id',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const inv = await prisma.invitation.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        include: { event: { include: { client: { select: { displayName: true, businessName: true } } } } },
      });
      if (inv.usherId !== usherId) throw new ApiError(404, 'NOT_FOUND', 'invitation not found');
      const unlocked = await venueUnlockedEventIds(usherId, [inv.eventId]);
      res.json({ ...inv, event: serializeEventVenue(inv.event, { role: 'USHER', hasConfirmedBooking: unlocked.has(inv.eventId) }) });
    }),
  );

  // usher accepts/declines invite — ACCEPTED becomes an ACCEPTED application
  r.patch(
    '/invitations/:id',
    wrap(async (req, res) => {
      const usherId = await verifiedUsherFor(req.auth.userId);
      const { status } = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).parse(req.body);
      await replyToInvitation(deps.prisma, String(req.params.id), usherId, status);
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
