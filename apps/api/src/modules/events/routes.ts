/**
 * Events, applications, invitations, and confirm-batch (TRD §7/§24, PRD §7).
 * Both hiring models converge: accepting an invitation yields an ACCEPTED
 * application, so confirm-batch has a single input shape.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@hq/database';
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

/** Placeholder shown for an event's precise venue until escrow is held (PRD §7/§13). */
const VENUE_MASKED = 'Exact venue is shared once your booking is confirmed';

/** Booking states in which escrow is held for the usher, unlocking the precise venue. */
const ESCROW_HELD_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID', 'DISPUTED'] as const;

/**
 * Withhold the precise venue from an usher until escrow is held for them (PRD
 * §7/§13). Single source of the masking rule so list and detail endpoints stay
 * consistent — a leak on any discovery surface defeats contact-masking.
 */
function maskVenue<T extends { venue: string }>(event: T, escrowHeld: boolean): T {
  return escrowHeld ? event : { ...event, venue: VENUE_MASKED };
}

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

/**
 * Of the given event ids, the set for which this usher has an escrow-held
 * booking — i.e. the events whose precise venue they may see. One batched query
 * so list endpoints don't N+1 or leak the venue (PRD §7/§13).
 */
async function escrowHeldEventIds(usherId: string, eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const rows = await prisma.booking.findMany({
    where: { usherId, eventId: { in: eventIds }, status: { in: [...ESCROW_HELD_STATUSES] } },
    select: { eventId: true },
  });
  return new Set(rows.map((b) => b.eventId));
}

/** Free-text staff preferences live in the `preferences` JSON blob (no column per field). */
function eventPreferences(b: { requirements?: string | undefined; hairstyle?: string | undefined }): Record<string, string> | undefined {
  const p: Record<string, string> = {};
  if (b.requirements) p.requirements = b.requirements;
  if (b.hairstyle) p.hairstyle = b.hairstyle;
  return Object.keys(p).length > 0 ? p : undefined;
}

/** Map a validated partial-event payload to a Prisma update (only provided keys). */
function eventUpdateData(b: UpdateEventInput): Prisma.EventUpdateInput {
  const data: Prisma.EventUpdateInput = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.venue !== undefined) data.venue = b.venue;
  if (b.state !== undefined) data.state = b.state ?? null;
  if (b.category !== undefined) data.category = b.category;
  if (b.eventDate !== undefined) data.eventDate = b.eventDate;
  if (b.startTime !== undefined) data.startTime = b.startTime;
  if (b.endTime !== undefined) data.endTime = b.endTime;
  if (b.headcount !== undefined) data.headcount = b.headcount;
  if (b.budgetPerHeadKobo !== undefined) data.budgetPerHead = b.budgetPerHeadKobo;
  if (b.dressCode !== undefined) data.dressCode = b.dressCode ?? null;
  if (b.accommodation !== undefined) data.accommodation = b.accommodation ?? null;
  if (b.requirements !== undefined || b.hairstyle !== undefined)
    data.preferences = eventPreferences(b) ?? Prisma.JsonNull;
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
        const unlocked = await escrowHeldEventIds(
          usherId,
          events.map((e) => e.id),
        );
        res.json(events.map((e) => maskVenue(e, unlocked.has(e.id))));
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
      const auth = req.auth;
      if (auth.role === 'ADMIN') {
        res.json(event);
        return;
      }
      if (auth.role === 'CLIENT') {
        // A client may read only their own events.
        if (event.clientId !== (await clientFor(auth.userId))) {
          throw new ApiError(404, 'NOT_FOUND', 'event not found');
        }
        res.json(event);
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
      const escrowHeld = booking != null && (ESCROW_HELD_STATUSES as readonly string[]).includes(booking.status);
      res.json(maskVenue(event, escrowHeld));
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
      // Was this usher already an active applicant? Drives whether we notify (no
      // re-notify on a duplicate apply).
      const prior = await prisma.application.findUnique({
        where: { eventId_usherId: { eventId, usherId } },
        select: { status: true },
      });
      const app = await prisma.application.upsert({
        where: { eventId_usherId: { eventId, usherId } },
        update: { status: 'APPLIED' },
        create: { eventId, usherId, status: 'APPLIED' },
      });
      res.status(201).json(app);

      // Tell the client a new usher applied (feedback: "notify me when someone applies").
      if (!prior || prior.status !== 'APPLIED') {
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
      const unlocked = await escrowHeldEventIds(
        usherId,
        apps.map((a) => a.eventId),
      );
      res.json(apps.map((a) => ({ ...a, event: maskVenue(a.event, unlocked.has(a.eventId)) })));
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
      const unlocked = await escrowHeldEventIds(
        usherId,
        rows.map((s) => s.event.id),
      );
      res.json(rows.map((s) => maskVenue(s.event, unlocked.has(s.event.id))));
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
      // Notify the invited usher: a persisted inbox row (+ push) and a live socket
      // nudge so an open app surfaces the invite immediately and can deep-link to it.
      const usher = await prisma.usher.findUnique({ where: { id: usherId }, select: { userId: true } });
      if (usher) {
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
      res.json(invites);
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
      res.json(inv);
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
      // RC-M2: Invitation status update and application creation must be atomic.
      // A crash between the two leaves the invitation ACCEPTED with no application
      // record, making this usher invisible to the client's applications list.
      await prisma.$transaction(async (tx) => {
        await tx.invitation.update({ where: { id: inv.id }, data: { status } });
        if (status === 'ACCEPTED') {
          await tx.application.upsert({
            where: { eventId_usherId: { eventId: inv.eventId, usherId } },
            update: { status: 'ACCEPTED' },
            create: { eventId: inv.eventId, usherId, status: 'ACCEPTED' },
          });
        }
      });
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
