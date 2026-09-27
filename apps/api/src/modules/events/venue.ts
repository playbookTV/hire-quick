import { prisma } from '@hq/database';
import type { BookingStatus } from '@hq/shared';

export const VENUE_MASKED = 'Exact venue is shared once your booking is confirmed';

/** Preserve the existing venue policy, including access after successful work. */
export const VENUE_UNLOCKING_STATUSES = [
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'PAID',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

export function bookingUnlocksVenue(status: BookingStatus): boolean {
  return (VENUE_UNLOCKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/** The route must establish owner/admin authorization before selecting that role. */
type EventViewer = { role: 'CLIENT' | 'ADMIN' } | { role: 'USHER'; hasConfirmedBooking: boolean };

export function serializeEventVenue<T extends { venue: string }>(event: T, viewer: EventViewer): T {
  return viewer.role !== 'USHER' || viewer.hasConfirmedBooking
    ? event
    : { ...event, venue: VENUE_MASKED };
}

/**
 * PRD §7/§15: an invitation or unpaid booking cannot disclose the precise venue.
 * Resolve access for this usher only, once per response collection. Any eligible
 * booking unlocks the event consistently even when an older pending row exists.
 */
export async function venueUnlockedEventIds(
  usherId: string,
  eventIds: string[],
): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const rows = await prisma.booking.findMany({
    where: {
      usherId,
      eventId: { in: [...new Set(eventIds)] },
      status: { in: [...VENUE_UNLOCKING_STATUSES] },
    },
    select: { eventId: true },
  });
  return new Set(rows.map((row) => row.eventId));
}
