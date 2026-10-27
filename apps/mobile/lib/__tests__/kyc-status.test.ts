import { describe, expect, it } from 'vitest';
import { kycNeedsReview } from '../kyc-status.js';

describe('identity check review state', () => {
  it('flags provider attention/error and names that did not fully match', () => {
    expect(kycNeedsReview({ providerStatus: 'attention' })).toBe(true);
    expect(kycNeedsReview({ providerStatus: 'error' })).toBe(true);
    expect(kycNeedsReview({ providerStatus: 'clear', nameCheck: 'partial' })).toBe(true);
    expect(kycNeedsReview({ providerStatus: 'clear', nameCheck: 'unavailable' })).toBe(true);
  });
  it('treats processing and fully matched results as in progress', () => {
    expect(kycNeedsReview(null)).toBe(false);
    expect(kycNeedsReview({ providerStatus: 'processing' })).toBe(false);
    expect(kycNeedsReview({ providerStatus: 'clear', nameCheck: 'matched' })).toBe(false);
  });
});
