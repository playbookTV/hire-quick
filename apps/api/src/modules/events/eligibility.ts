import { Prisma, type Event } from '@hq/database';
import { ApiError } from '../../app.js';
import { eventInstant, VACATED_BOOKING_STATUSES } from './staffing.js';

type Tx = Prisma.TransactionClient;

/** Also acquired by the availability writer; protects absent rows and cross-event reservations. */
export async function lockUsherSchedules(tx: Tx, usherIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(usherIds)].sort())
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`usher-schedule:${id}`}, 0))::text`;
}

export function assertRecruiting(event: Event, now = new Date()): void {
  if (!['OPEN', 'PARTIALLY_STAFFED'].includes(event.status) || now >= eventInstant(event.eventDate, event.startTime))
    throw new ApiError(409, 'EVENT_LOCKED', 'this event is not accepting staff');
}

/** Caller holds event and schedule locks. Account/profile locks fence suspension and verification changes. */
export async function assertStaffEligible(tx: Tx, event: Event, usherIds: readonly string[]): Promise<void> {
  const ids = [...new Set(usherIds)].sort();
  const client = await tx.client.findUniqueOrThrow({ where: { id: event.clientId }, select: { userId: true } });
  const candidates = await tx.usher.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  const users = [...new Set([client.userId, ...candidates.map((u) => u.userId)])].sort();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(users.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (ids.length)
    await tx.$queryRaw(Prisma.sql`SELECT id FROM ushers WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  const owner = await tx.user.findUniqueOrThrow({ where: { id: client.userId }, select: { status: true } });
  const eligible = await tx.usher.count({ where: { id: { in: ids }, verificationStatus: 'VERIFIED', user: { status: 'ACTIVE' } } });
  if (owner.status !== 'ACTIVE' || eligible !== ids.length)
    throw new ApiError(409, 'SELECTION_CHANGED', 'one or more participants are no longer eligible');
  const unavailable = await tx.availability.findFirst({ where: { usherId: { in: ids }, date: event.eventDate, status: { not: 'AVAILABLE' } } });
  if (unavailable) throw new ApiError(409, 'SCHEDULE_CONFLICT', 'one or more ushers are unavailable on this date');
  const overlap = await tx.booking.findFirst({ where: {
    usherId: { in: ids }, eventId: { not: event.id }, status: { notIn: VACATED_BOOKING_STATUSES },
    event: { eventDate: event.eventDate, startTime: { lt: event.endTime }, endTime: { gt: event.startTime } },
  } });
  if (overlap) throw new ApiError(409, 'SCHEDULE_CONFLICT', 'one or more ushers already have an overlapping booking');
  // A wait for schedule/account locks may have crossed the event start time.
  assertRecruiting(event);
}

export async function assertNoLiveBooking(tx: Tx, eventId: string, usherId: string): Promise<void> {
  if (await tx.booking.findFirst({ where: { eventId, usherId, status: { notIn: VACATED_BOOKING_STATUSES } } }))
    throw new ApiError(409, 'ALREADY_CONFIRMED', 'this usher already has a booking for this event');
}
