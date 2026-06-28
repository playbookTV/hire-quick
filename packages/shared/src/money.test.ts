import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  kobo,
  naira,
  splitFee,
  pctOf,
  sumKobo,
  formatNaira,
  MoneyError,
  PLATFORM_FEE_BPS,
  refundWithFeeDeduction,
} from './money.js';

describe('money (kobo)', () => {
  it('rejects non-integer kobo', () => {
    expect(() => kobo(1.5)).toThrow(MoneyError);
  });

  it('converts naira to kobo', () => {
    expect(naira(150)).toBe(15_000);
    expect(naira(0.5)).toBe(50);
  });

  it('splitFee: fee + payout always equals gross (no rounding leak)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_00 }), fc.integer({ min: 0, max: 10_000 }), (g, bps) => {
        const { fee, payout } = splitFee(kobo(g), bps);
        expect(fee + payout).toBe(g);
        expect(fee).toBeLessThanOrEqual(g);
        expect(payout).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('15% platform fee on ₦10,000', () => {
    const { fee, payout } = splitFee(naira(10_000), PLATFORM_FEE_BPS);
    expect(fee).toBe(150_000); // ₦1,500
    expect(payout).toBe(850_000); // ₦8,500
  });

  it('pctOf floors', () => {
    expect(pctOf(kobo(101), 50)).toBe(50);
  });

  it('sumKobo adds', () => {
    expect(sumKobo([kobo(10), kobo(20), kobo(30)])).toBe(60);
  });

  it('formats naira', () => {
    expect(formatNaira(kobo(150_000))).toBe('₦1,500.00');
    expect(formatNaira(kobo(50))).toBe('₦0.50');
  });
});

describe('refundWithFeeDeduction (C2 scaffold)', () => {
  it('splits floor(fee) and gives the client the exact remainder — no rounding leak', () => {
    const { clientRefund, retainedFee } = refundWithFeeDeduction(kobo(10_001), 150); // 1.5%
    expect(retainedFee).toBe(150); // floor(10001 * 150 / 10000) = floor(150.015)
    expect(clientRefund).toBe(9_851);
    expect(clientRefund + retainedFee).toBe(10_001);
  });

  it('property: clientRefund + retainedFee === refund for any amount/bps', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_147_483_647 }), fc.integer({ min: 0, max: 10_000 }), (amt, bps) => {
        const { clientRefund, retainedFee } = refundWithFeeDeduction(kobo(amt), bps);
        return clientRefund + retainedFee === amt && retainedFee >= 0 && clientRefund >= 0;
      }),
    );
  });

  it('rejects out-of-range basis points', () => {
    expect(() => refundWithFeeDeduction(kobo(1000), 10_001)).toThrow(MoneyError);
    expect(() => refundWithFeeDeduction(kobo(1000), -1)).toThrow(MoneyError);
  });
});
