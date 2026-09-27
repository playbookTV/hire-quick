import { describe, expect, it } from 'vitest';
import { cancellationAmounts, policyForCancellation } from './policy.js';
describe('active cancellation quote', () => {
  it('matches the disabled fee policy', () => {
    const outcome = policyForCancellation('CLIENT', 'GT_48H');
    expect(outcome.lessProcessingFee).toBe(false);
    expect(cancellationAmounts(10001, outcome)).toEqual({
      refundKobo: 10001,
      usherCompensationKobo: 0,
      processingFeeKobo: 0,
    });
  });
  it('preserves odd kobo in a policy preview', () => {
    expect(cancellationAmounts(10001, policyForCancellation('CLIENT', 'BETWEEN_12_48H'))).toEqual({
      refundKobo: 5000,
      usherCompensationKobo: 5001,
      processingFeeKobo: 0,
    });
  });
});
