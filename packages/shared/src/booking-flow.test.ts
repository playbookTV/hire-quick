import { describe, expect, it } from 'vitest';
import { eventInstant, staffingCounts } from './booking-flow.js';
import { cancelWindow } from './policy.js';
describe('booking flow contracts', () => {
  it('maps midnight Lagos time across the UTC date boundary', () => {
    expect(eventInstant('2030-06-01', '00:30').toISOString()).toBe('2030-05-31T23:30:00.000Z');
  });
  it.each([
    [48.01, 'GT_48H'],
    [48, 'BETWEEN_12_48H'],
    [47.5, 'BETWEEN_12_48H'],
    [12, 'BETWEEN_12_48H'],
    [11.5, 'LT_12H'],
    [0, 'LT_12H'],
  ] as const)('uses the settlement instant at %s hours before an event', (hours, expected) => {
    const event = eventInstant('2030-06-01', '10:00');
    expect(cancelWindow(event, new Date(event.getTime() - hours * 3_600_000))).toBe(expected);
  });
  it('keeps payment reservations and vacated slots out of confirmed staffing', () => {
    expect(
      staffingCounts(6, [
        'CONFIRMED',
        'CHECKED_IN',
        'PENDING_PAYMENT',
        'REFUNDED',
        'CANCELLED',
        'NO_SHOW',
      ]),
    ).toEqual({ confirmed: 2, reserved: 1, vacated: 3, available: 3 });
    expect(staffingCounts(1, ['PAID', 'DISPUTED'])).toEqual({
      confirmed: 2,
      reserved: 0,
      vacated: 0,
      available: 0,
    });
  });
});
