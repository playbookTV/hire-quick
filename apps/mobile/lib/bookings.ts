/**
 * Shared booking helpers so the usher home and profile compute "upcoming jobs"
 * identically (feedback: surface upcoming jobs on the profile too).
 */
import type { Booking } from './types.js';

/** Event start as epoch ms for chronological sort; bookings with no event sort last. */
export function bookingStartMs(b: Booking): number {
  if (!b.event) return Number.POSITIVE_INFINITY;
  const d = new Date(b.event.eventDate);
  const [h, m] = b.event.startTime.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/** Active/confirmed upcoming work, soonest first (excludes paid-out and cancelled). */
export function upcomingBookings(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => b.status !== 'PAID' && b.status !== 'CANCELLED').sort((a, b) => bookingStartMs(a) - bookingStartMs(b));
}
