import { describe, expect, it } from 'vitest';
import { BOOKING_STATUSES } from '@hq/shared';
import { bookingUnlocksVenue, serializeEventVenue, VENUE_MASKED } from '../venue.js';

const event = {
  venue: 'Private venue',
  state: 'Lagos',
  title: 'Gala',
  client: { displayName: 'Owner' },
};

describe('event venue serialization policy', () => {
  it.each(BOOKING_STATUSES)('applies the established policy for %s', (status) => {
    const allowed = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID', 'DISPUTED'].includes(status);
    expect(bookingUnlocksVenue(status)).toBe(allowed);
    expect(
      serializeEventVenue(event, {
        role: 'USHER',
        hasConfirmedBooking: bookingUnlocksVenue(status),
      }).venue,
    ).toBe(allowed ? event.venue : VENUE_MASKED);
  });

  it.each(['CLIENT', 'ADMIN'] as const)('preserves an already-authorized %s view', (role) => {
    expect(serializeEventVenue(event, { role })).toEqual(event);
  });

  it('masks without changing the source event or coarse location/display identity', () => {
    const masked = serializeEventVenue(event, { role: 'USHER', hasConfirmedBooking: false });
    expect(masked).toEqual({ ...event, venue: VENUE_MASKED });
    expect(event.venue).toBe('Private venue');
  });
});
