import { describe, it, expect } from 'vitest';
import { lagosDateKey, nextPayoutAt, payoutRunTotal, PAYOUT_RUN_STATUSES } from './payouts.js';
import {
  PAYOUT_RUN_TRANSITIONS,
  assertPayoutRunTransition,
  canTransitionPayoutRun,
  IllegalTransition,
} from './state-machines.js';

describe('weekly payout schedule (Thursday 09:00 Lagos)', () => {
  it('returns this Thursday 08:00 UTC before the run time', () => {
    // Friday 23 Oct 2026 → Thursday 29 Oct
    expect(nextPayoutAt(new Date('2026-10-23T12:00:00Z')).toISOString()).toBe('2026-10-29T08:00:00.000Z');
    // Thursday 29 Oct, 08:59 Lagos
    expect(nextPayoutAt(new Date('2026-10-29T07:59:00Z')).toISOString()).toBe('2026-10-29T08:00:00.000Z');
  });

  it('moves to next week at and after the run time', () => {
    expect(nextPayoutAt(new Date('2026-10-29T08:00:00Z')).toISOString()).toBe('2026-11-05T08:00:00.000Z');
    expect(nextPayoutAt(new Date('2026-10-29T15:00:00Z')).toISOString()).toBe('2026-11-05T08:00:00.000Z');
  });

  it('uses the Lagos date near UTC midnight', () => {
    // Wednesday 23:30 UTC is already Thursday 00:30 in Lagos
    expect(lagosDateKey(new Date('2026-10-28T23:30:00Z'))).toBe('2026-10-29');
    expect(nextPayoutAt(new Date('2026-10-28T23:30:00Z')).toISOString()).toBe('2026-10-29T08:00:00.000Z');
  });

  it('totals lines beyond the Int32 kobo column limit without overflow', () => {
    expect(payoutRunTotal([{ amountKobo: 2_000_000_000 }, { amountKobo: 2_000_000_000 }])).toBe(4_000_000_000);
  });
});

describe('payout run state machine', () => {
  it('has a row for every status', () => {
    expect(Object.keys(PAYOUT_RUN_TRANSITIONS).sort()).toEqual([...PAYOUT_RUN_STATUSES].sort());
  });

  it('allows submit, reject back to draft, approve and execute', () => {
    expect(canTransitionPayoutRun('DRAFT', 'AWAITING_APPROVAL')).toBe(true);
    expect(canTransitionPayoutRun('AWAITING_APPROVAL', 'DRAFT')).toBe(true);
    expect(canTransitionPayoutRun('AWAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionPayoutRun('APPROVED', 'EXECUTED')).toBe(true);
  });

  it('never approves a draft directly or reopens a finished run', () => {
    expect(canTransitionPayoutRun('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionPayoutRun('APPROVED', 'CANCELLED')).toBe(false);
    expect(canTransitionPayoutRun('EXECUTED', 'DRAFT')).toBe(false);
    expect(() => assertPayoutRunTransition('CANCELLED', 'DRAFT')).toThrow(IllegalTransition);
  });
});
