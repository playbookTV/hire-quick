import { describe, it, expect } from 'vitest';
import {
  BOOKING_TRANSITIONS,
  canTransitionBooking,
  assertBookingTransition,
  assertWithdrawalTransition,
  IllegalTransition,
} from './state-machines.js';
import { BOOKING_STATUSES } from './enums.js';

describe('booking state machine (TRD §12/§25)', () => {
  it('allows the documented happy path', () => {
    expect(canTransitionBooking('PENDING_PAYMENT', 'CONFIRMED')).toBe(true);
    expect(canTransitionBooking('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionBooking('CHECKED_IN', 'COMPLETED')).toBe(true);
    expect(canTransitionBooking('COMPLETED', 'PAID')).toBe(true);
  });

  it('rejects the §25 illegal cases', () => {
    // PAID without RELEASE path: cannot jump CONFIRMED → PAID
    expect(canTransitionBooking('CONFIRMED', 'PAID')).toBe(false);
    // REFUNDED is terminal (no refund-of-already-refunded)
    expect(canTransitionBooking('REFUNDED', 'REFUNDED')).toBe(false);
    expect(canTransitionBooking('REFUNDED', 'PAID')).toBe(false);
    // cannot un-cancel
    expect(canTransitionBooking('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('assert throws IllegalTransition with context', () => {
    expect(() => assertBookingTransition('PAID', 'CONFIRMED')).toThrow(IllegalTransition);
  });

  it('every status has an explicit (possibly empty) transition set', () => {
    for (const s of BOOKING_STATUSES) {
      expect(BOOKING_TRANSITIONS[s]).toBeDefined();
    }
  });

  it('withdrawal cannot skip PROCESSING-less double pay', () => {
    expect(() => assertWithdrawalTransition('PAID', 'PAID')).toThrow(IllegalTransition);
    expect(() => assertWithdrawalTransition('REQUESTED', 'PROCESSING')).not.toThrow();
  });
});
