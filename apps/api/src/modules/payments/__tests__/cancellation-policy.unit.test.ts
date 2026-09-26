import { describe, expect, it } from 'vitest';
import { cancellationSnapshot } from '../cancellation-policy.js';

const quote = {
  policy: 'CLIENT_CANCEL_V2',
  staffPay: 1_000_000,
  clientUserId: '00000000-0000-4000-8000-000000000001',
  requestedAt: '2026-09-26T12:00:00.000Z',
  eventStart: '2026-09-27T12:00:00.000Z',
  window: 'BETWEEN_12_48H',
  grossAmount: 1_150_000,
  refundKobo: 575_000,
  usherCompensationKobo: 575_000,
  platformFeeKobo: 75_000,
  usherPayoutKobo: 500_000,
  processingFeeKobo: 0,
};
describe('versioned cancellation snapshots', () => {
  it('retains the agreed payout and added fee on retry', () => {
    expect(cancellationSnapshot(quote)).toEqual(quote);
  });
  it('rejects a pricing downgrade or tampered allocation', () => {
    expect(() => cancellationSnapshot({ ...quote, policy: 'CLIENT_CANCEL_V1' })).toThrow();
    expect(() => cancellationSnapshot({ ...quote, staffPay: undefined })).toThrow();
    expect(() => cancellationSnapshot({ ...quote, staffPay: 900_000 })).toThrow();
    expect(() => cancellationSnapshot({ ...quote, usherPayoutKobo: 425_000 })).toThrow();
  });
});
