import type { BookingStatus, Event, EventStatus, Prisma } from '@hq/database';

type Tx = Prisma.TransactionClient;
export const VACATED_BOOKING_STATUSES: BookingStatus[] = ['CANCELLED', 'REFUNDED', 'NO_SHOW'];
// Event completion tracks finished work; COMPLETED earnings may still be held.
const FINISHED_BOOKING_STATUSES: BookingStatus[] = [
  'COMPLETED',
  'PAID',
  ...VACATED_BOOKING_STATUSES,
];

import { eventInstant } from '@hq/shared';
export { eventInstant } from '@hq/shared';

/** Recruitment never reopens after start, even when cancellations free capacity. */
export function staffingStatus(
  event: Pick<Event, 'status' | 'headcount' | 'eventDate' | 'startTime' | 'endTime'>,
  bookings: readonly BookingStatus[],
  now = new Date(),
): EventStatus {
  if (['DRAFT', 'CANCELLED', 'COMPLETED'].includes(event.status)) return event.status;
  if (
    now >= eventInstant(event.eventDate, event.endTime) &&
    bookings.every((s) => FINISHED_BOOKING_STATUSES.includes(s))
  )
    return 'COMPLETED';
  if (event.status === 'IN_PROGRESS' || now >= eventInstant(event.eventDate, event.startTime))
    return 'IN_PROGRESS';
  const occupied = bookings.filter((s) => !VACATED_BOOKING_STATUSES.includes(s)).length;
  return occupied >= event.headcount
    ? 'FULLY_STAFFED'
    : occupied > 0
      ? 'PARTIALLY_STAFFED'
      : 'OPEN';
}

/** Caller holds the event lock; every booking status writer uses this hierarchy. */
export async function refreshEventStaffing(
  tx: Tx,
  eventId: string,
  now = new Date(),
): Promise<void> {
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
  const bookings = await tx.booking.findMany({ where: { eventId }, select: { status: true } });
  const status = staffingStatus(
    event,
    bookings.map((b) => b.status),
    now,
  );
  if (status !== event.status) await tx.event.update({ where: { id: eventId }, data: { status } });
}

/** Read immutable identity, then lock event → order → booking. Never call after a booking lock. */
export async function lockBookingLifecycle(tx: Tx, bookingId: string) {
  const identity = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { eventId: true, orderId: true },
  });
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${identity.eventId}::uuid FOR UPDATE`;
  if (identity.orderId)
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${identity.orderId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
  return identity;
}

export async function lockOrderLifecycle(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { eventId: true },
  });
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${order.eventId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
}
