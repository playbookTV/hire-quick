import { describe, expect, it } from 'vitest';
import {
  bookingReleaseAt,
  disputeWindowOpen,
  cancelWindow,
  cancellationSettlement,
  policyForCancellation,
} from './policy.js';
import { canTransitionBooking } from './state-machines.js';
import { MAX_INT32_KOBO, priceBooking, kobo } from './money.js';

describe('approved settlement policy', () => {
  it('uses Lagos event end and non-overlapping dispute/release boundaries', () => {
    const deadline = bookingReleaseAt('2026-09-21', '18:00');
    expect(deadline.toISOString()).toBe('2026-09-24T17:00:00.000Z');
    expect(disputeWindowOpen('2026-09-21', '18:00', new Date(+deadline - 1))).toBe(true);
    expect(disputeWindowOpen('2026-09-21', '18:00', deadline)).toBe(false);
    expect(disputeWindowOpen('2026-09-21', '18:00', new Date(+deadline + 1))).toBe(false);
    expect(canTransitionBooking('COMPLETED', 'DISPUTED')).toBe(true);
    expect(canTransitionBooking('PAID', 'DISPUTED')).toBe(false);
  });
  it.each([
    [48 * 3_600_000 + 1, 100],
    [48 * 3_600_000, 50],
    [48 * 3_600_000 - 1, 50],
    [12 * 3_600_000 + 1, 50],
    [12 * 3_600_000, 50],
    [12 * 3_600_000 - 1, 0],
  ])('classifies %i ms before start as a %i percent refund', (offset, percent) => {
    const start = new Date('2026-09-21T09:00:00Z');
    const outcome = policyForCancellation(
      'CLIENT',
      cancelWindow(start, new Date(+start - offset!)),
    );
    expect(outcome.clientRefundPct).toBe(percent);
  });
  it('preserves legacy cancellation allocations', () => {
    expect(
      cancellationSettlement(10_001, policyForCancellation('CLIENT', 'BETWEEN_12_48H')),
    ).toEqual({
      refundKobo: 5000,
      usherCompensationKobo: 5001,
      platformFeeKobo: 750,
      usherPayoutKobo: 4251,
      processingFeeKobo: 0,
    });
  });
  it.each([0, 1, 3, 10_001, 5_000_001, MAX_INT32_KOBO])(
    'conserves every kobo of %i in every window',
    (gross) => {
      for (const window of ['GT_48H', 'BETWEEN_12_48H', 'LT_12H'] as const) {
        const p = cancellationSettlement(gross, policyForCancellation('CLIENT', window));
        expect(p.refundKobo + p.usherPayoutKobo + p.platformFeeKobo).toBe(gross);
        expect(p.processingFeeKobo).toBe(0);
        expect(Object.values(p).every(Number.isInteger)).toBe(true);
      }
    },
  );
});


describe('client-paid fee cancellation', () => {
  it.each([
    ['GT_48H', 1_150_000, 0, 0],
    ['BETWEEN_12_48H', 575_000, 500_000, 75_000],
    ['LT_12H', 0, 1_000_000, 150_000],
  ] as const)('%s refunds pay and fee proportionally', (window, refund, payout, fee) => {
    const result = cancellationSettlement(1_150_000, policyForCancellation('CLIENT', window), 1_000_000);
    expect(result.refundKobo).toBe(refund);
    expect(result.usherPayoutKobo).toBe(payout);
    expect(result.platformFeeKobo).toBe(fee);
  });
  it.each([1, 7, 10_001, 10_007, 1_867_000_000])('conserves both components of %i kobo', (base) => {
    const price = priceBooking(kobo(base));
    for (const window of ['GT_48H', 'BETWEEN_12_48H', 'LT_12H'] as const) {
      const policy = policyForCancellation('CLIENT', window);
      const result = cancellationSettlement(price.gross, policy, base);
      expect(result.usherPayoutKobo).toBe(base - Math.floor(base * policy.clientRefundPct / 100));
      expect(result.platformFeeKobo).toBe(price.fee - Math.floor(price.fee * policy.clientRefundPct / 100));
      expect(result.refundKobo + result.usherPayoutKobo + result.platformFeeKobo).toBe(price.gross);
      expect(cancellationSettlement(price.gross, policyForCancellation('USHER', window), base)).toMatchObject({
        refundKobo: price.gross, usherPayoutKobo: 0, platformFeeKobo: 0,
      });
    }
  });
});
