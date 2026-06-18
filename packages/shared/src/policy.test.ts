import { describe, it, expect } from 'vitest';
import {
  cancelWindow,
  policyForCancellation,
  NO_SHOW_OUTCOME,
  type CancelWindow,
} from './policy.js';

// Phase 0 exit gate: policy() must return the exact PRD §13 numbers.
describe('cancellation policy matrix (PRD §13)', () => {
  it('classifies windows by hours before event start', () => {
    const start = new Date('2026-07-01T18:00:00Z');
    expect(cancelWindow(start, new Date('2026-06-28T18:00:00Z'))).toBe('GT_48H'); // 72h
    expect(cancelWindow(start, new Date('2026-07-01T00:00:00Z'))).toBe('BETWEEN_12_48H'); // 18h
    expect(cancelWindow(start, new Date('2026-07-01T12:00:00Z'))).toBe('LT_12H'); // 6h
    expect(cancelWindow(start, new Date('2026-06-29T18:00:00Z'))).toBe('BETWEEN_12_48H'); // exactly 48h
  });

  it('client cancel — exact PRD §13 row values', () => {
    expect(policyForCancellation('CLIENT', 'GT_48H')).toMatchObject({
      clientRefundPct: 100,
      usherPayoutPct: 0,
      usherReputation: 'NONE',
      lessProcessingFee: true,
    });
    expect(policyForCancellation('CLIENT', 'BETWEEN_12_48H')).toMatchObject({
      clientRefundPct: 50,
      usherPayoutPct: 50,
      usherReputation: 'NONE',
    });
    expect(policyForCancellation('CLIENT', 'LT_12H')).toMatchObject({
      clientRefundPct: 0,
      usherPayoutPct: 100,
      usherReputation: 'NONE',
    });
  });

  it('usher cancel — client always 100%, reputation escalates', () => {
    expect(policyForCancellation('USHER', 'GT_48H')).toMatchObject({
      clientRefundPct: 100,
      usherPayoutPct: 0,
      usherReputation: 'MINOR_FLAG',
    });
    expect(policyForCancellation('USHER', 'BETWEEN_12_48H')).toMatchObject({
      clientRefundPct: 100,
      usherReputation: 'PENALTY',
    });
    expect(policyForCancellation('USHER', 'LT_12H')).toMatchObject({
      clientRefundPct: 100,
      usherReputation: 'MAJOR_PENALTY',
      suspendIfRepeat: true,
    });
  });

  it('no-show: client refunded 100%, usher unpaid + major penalty', () => {
    expect(NO_SHOW_OUTCOME).toMatchObject({
      clientRefundPct: 100,
      usherPayoutPct: 0,
      usherReputation: 'MAJOR_PENALTY',
    });
  });

  it('invariant: every cancellation outcome sums to 100%', () => {
    const windows: CancelWindow[] = ['GT_48H', 'BETWEEN_12_48H', 'LT_12H'];
    for (const actor of ['CLIENT', 'USHER'] as const) {
      for (const w of windows) {
        const o = policyForCancellation(actor, w);
        expect(o.clientRefundPct + o.usherPayoutPct).toBe(100);
      }
    }
  });
});
