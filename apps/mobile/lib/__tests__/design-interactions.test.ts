import { describe, expect, it } from 'vitest';
import { conversationTitle, filterConversations } from '../conversations.js';
import { calendarWeeks, summarizeAvailability, type AvailabilityDayState } from '../ui-state.js';
import type { Booking } from '../types.js';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    eventId: 'event-1',
    usherId: 'usher-1',
    status: 'CONFIRMED',
    amount: 1150000,
    createdAt: '2026-10-01T00:00:00Z',
    usher: { displayName: 'Amaka Okafor' },
    event: {
      title: 'Product launch',
      eventDate: '2026-10-30',
      startTime: '16:00',
      client: { displayName: 'Tola Events', businessName: 'Tola Events' },
    },
    ...overrides,
  };
}

describe('conversation filters', () => {
  it('keeps the existing chat eligibility rules, including completed and cancelled chats', () => {
    const chats = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].map((status) =>
      booking({ status }),
    );
    expect(filterConversations(chats, false, false, '').map((row) => row.status)).toEqual([
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('shows only actual unread counts and combines the unread and search filters', () => {
    const unread = booking({ unreadCount: 2 });
    const read = booking({ id: 'read', unreadCount: 0 });
    const unknown = booking({ id: 'unknown' });
    expect(filterConversations([unread, read, unknown], false, true, '  AMAKA  ')).toEqual([
      unread,
    ]);
    expect(filterConversations([unread], false, true, 'wedding')).toEqual([]);
    expect(filterConversations([unread], false, true, 'product')).toEqual([unread]);
  });

  it('searches the correct counterparty for each role and retains title fallbacks', () => {
    const chat = booking();
    expect(filterConversations([chat], true, false, 'tola')).toEqual([chat]);
    expect(filterConversations([chat], false, false, 'tola')).toEqual([]);
    expect(conversationTitle(booking({ usher: undefined }), false)).toBe('Product launch');
    expect(conversationTitle(booking({ usher: undefined, event: undefined }), false)).toBe(
      'Booking · bookin',
    );
  });
});

describe('availability calendar', () => {
  it('aligns complete weeks for leap February and months requiring six rows', () => {
    const leap = calendarWeeks(2028, 1);
    expect(leap[0]?.slice(0, 3)).toEqual([null, null, 1]);
    expect(leap.flat().filter((day) => day !== null)).toEqual(
      Array.from({ length: 29 }, (_, i) => i + 1),
    );
    const sixRows = calendarWeeks(2026, 7);
    expect(sixRows).toHaveLength(6);
    expect(sixRows.every((week) => week.length === 7)).toBe(true);
    expect(calendarWeeks(2026, 10)[0]?.[0]).toBe(1);
  });

  it('counts each visible date once and leaves unset days out of availability totals', () => {
    const days = new Map<number, AvailabilityDayState>([
      [1, 'available'],
      [2, 'busy'],
      [3, 'available'],
      [4, 'job'],
      [32, 'available'],
    ]);
    const booked = new Set([3, 4]);
    const counts = summarizeAvailability(31, (day) =>
      booked.has(day) ? 'job' : (days.get(day) ?? 'default'),
    );
    expect(counts).toEqual({ available: 1, busy: 1, job: 2 });
    expect(summarizeAvailability(28, () => 'default')).toEqual({ available: 0, busy: 0, job: 0 });
  });
});
