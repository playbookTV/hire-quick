import { describe, expect, it } from 'vitest';
import type { BookingStatus, EventStatus } from '@hq/database';
import { eventInstant, staffingStatus } from '../staffing.js';
import { invitationCanReply } from '../recruitment.js';

const event = { status: 'FULLY_STAFFED' as EventStatus, headcount: 2, eventDate: new Date('2027-06-01'), startTime: '10:00', endTime: '18:00' };
const before = new Date('2027-06-01T08:00:00Z');
const during = new Date('2027-06-01T09:00:00Z');
const after = new Date('2027-06-01T17:00:00Z');
describe('event staffing rules', () => {
  it('uses Lagos time and closes recruitment at the start instant', () => {
    expect(eventInstant(event.eventDate, event.startTime).toISOString()).toBe('2027-06-01T09:00:00.000Z');
    expect(staffingStatus(event, [], during)).toBe('IN_PROGRESS');
  });
  it('counts pending checkout as occupied and reopens only vacated future slots', () => {
    expect(staffingStatus(event, ['PENDING_PAYMENT', 'CONFIRMED'], before)).toBe('FULLY_STAFFED');
    expect(staffingStatus(event, ['PAID', 'REFUNDED'], before)).toBe('PARTIALLY_STAFFED');
    expect(staffingStatus(event, ['CANCELLED', 'NO_SHOW'], before)).toBe('OPEN');
  });
  it.each(['DRAFT', 'CANCELLED', 'COMPLETED'] as const)('preserves %s state', (status) => {
    expect(staffingStatus({ ...event, status }, [], after)).toBe(status);
  });
  it('never reopens a started event and completes empty or settled events after end', () => {
    expect(staffingStatus({ ...event, status: 'IN_PROGRESS' }, [], before)).toBe('IN_PROGRESS');
    expect(staffingStatus(event, ['PAID', 'REFUNDED'], during)).toBe('IN_PROGRESS');
    expect(staffingStatus(event, [], after)).toBe('COMPLETED');
    expect(staffingStatus(event, ['PAID', 'CANCELLED', 'NO_SHOW', 'REFUNDED'], after)).toBe('COMPLETED');
  });
  it.each(['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'DISPUTED'] as BookingStatus[])('keeps unresolved %s event open for resolution', (status) => {
    expect(staffingStatus(event, [status], after)).toBe('IN_PROGRESS');
  });
  it('permits reply replay and pre-booking withdrawal, with declined/expired cycles closed', () => {
    expect(invitationCanReply('SENT', 'ACCEPTED')).toBe(true);
    expect(invitationCanReply('SENT', 'DECLINED')).toBe(true);
    expect(invitationCanReply('ACCEPTED', 'DECLINED')).toBe(true);
    expect(invitationCanReply('ACCEPTED', 'ACCEPTED')).toBe(true);
    expect(invitationCanReply('DECLINED', 'DECLINED')).toBe(true);
    expect(invitationCanReply('DECLINED', 'ACCEPTED')).toBe(false);
    expect(invitationCanReply('EXPIRED', 'ACCEPTED')).toBe(false);
    expect(invitationCanReply('EXPIRED', 'DECLINED')).toBe(false);
  });
});
