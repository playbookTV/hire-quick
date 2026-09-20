/**
 * Shared booking helpers so the usher home and profile compute "upcoming jobs"
 * identically (feedback: surface upcoming jobs on the profile too).
 */
import type { Booking } from './types.js';
import { eventInstant } from '@hq/shared';

/** Event start as epoch ms for chronological sort; bookings with no event sort last. */
export function bookingStartMs(b: Booking): number {
  if (!b.event) return Number.POSITIVE_INFINITY;
  return eventInstant(b.event.eventDate, b.event.startTime).getTime();
}

/** Active/confirmed upcoming work, soonest first (excludes paid-out and cancelled). */
export function upcomingBookings(bookings: Booking[]): Booking[] {
  return bookings
    .filter((b) => ['CONFIRMED', 'CHECKED_IN'].includes(b.status))
    .sort((a, b) => bookingStartMs(a) - bookingStartMs(b));
}
