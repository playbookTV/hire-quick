import { Prisma, type Event, type PrismaClient } from '@hq/database';
import { createEventSchema, updateEventSchema, type UpdateEventInput } from '@hq/shared';
import { ApiError } from '../../app.js';
import { writeAudit } from '../audit.js';

export function validateEventValues(event: Event, patch: UpdateEventInput = {}): void {
  createEventSchema.parse({
    title: event.title, venue: event.venue, category: event.category,
    eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime,
    headcount: event.headcount, budgetPerHeadKobo: event.budgetPerHead,
    ...(event.state === null ? {} : { state: event.state }),
    ...(event.dressCode === null ? {} : { dressCode: event.dressCode }),
    ...(event.accommodation === null ? {} : { accommodation: event.accommodation }),
    ...patch,
  });
}

/** Empty text clears only that preference; omitted keys, including unknown keys, survive. */
export function eventUpdateData(b: UpdateEventInput, preferences: Prisma.JsonValue): Prisma.EventUpdateInput {
  const data: Prisma.EventUpdateInput = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.venue !== undefined) data.venue = b.venue;
  if (b.state !== undefined) data.state = b.state;
  if (b.category !== undefined) data.category = b.category;
  if (b.eventDate !== undefined) data.eventDate = b.eventDate;
  if (b.startTime !== undefined) data.startTime = b.startTime;
  if (b.endTime !== undefined) data.endTime = b.endTime;
  if (b.headcount !== undefined) data.headcount = b.headcount;
  if (b.budgetPerHeadKobo !== undefined) data.budgetPerHead = b.budgetPerHeadKobo;
  if (b.dressCode !== undefined) data.dressCode = b.dressCode;
  if (b.accommodation !== undefined) data.accommodation = b.accommodation;
  if (b.requirements !== undefined || b.hairstyle !== undefined) {
    const merged: Prisma.JsonObject = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? { ...preferences } : {};
    for (const field of ['requirements', 'hairstyle'] as const) {
      if (b[field] === '') delete merged[field];
      else if (b[field] !== undefined) merged[field] = b[field];
    }
    data.preferences = Object.keys(merged).length ? merged : Prisma.JsonNull;
  }
  return data;
}

export async function editEvent(prisma: PrismaClient, clientId: string, userId: string, eventId: string, body: unknown) {
  const patch = updateEventSchema.parse(body);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
    const existing = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { _count: { select: { bookings: true } } } });
    if (existing.clientId !== clientId) throw new ApiError(403, 'FORBIDDEN', 'not your event');
    if (!['OPEN', 'PARTIALLY_STAFFED'].includes(existing.status) || existing._count.bookings > 0)
      throw new ApiError(409, 'EVENT_LOCKED', 'this event can no longer be edited');
    validateEventValues(existing, patch);
    const data = eventUpdateData(patch, existing.preferences);
    const updated = await tx.event.update({ where: { id: eventId }, data });
    await writeAudit({ actorId: userId, action: 'EVENT_UPDATED', target: eventId, metadata: { fields: Object.keys(data) } }, tx);
    return updated;
  }, { timeout: 30_000, maxWait: 30_000 });
}
