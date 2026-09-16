import { describe, expect, it } from 'vitest';
import { MAX_INT32_KOBO } from '@hq/shared';
import {
  assertLedgerAmount,
  assertSignedLedgerAmount,
  checkedLedgerBalance,
  assertOrderAllocations,
  assertPaymentAllocation,
} from '../ledger/amounts.js';

describe('integer ledger boundaries', () => {
  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-integer/non-safe amount %s',
    (amount) => {
      expect(() => assertSignedLedgerAmount(amount)).toThrow();
    },
  );
  it.each([MAX_INT32_KOBO + 1, -MAX_INT32_KOBO - 1])(
    'rejects unrepresentable signed amount %s',
    (amount) => {
      expect(() => assertSignedLedgerAmount(amount)).toThrow(
        expect.objectContaining({ code: 'AMOUNT_LIMIT' }),
      );
    },
  );
  it('accepts exact signed endpoints and explicitly allowed zero', () => {
    expect(() => assertSignedLedgerAmount(MAX_INT32_KOBO)).not.toThrow();
    expect(() => assertSignedLedgerAmount(-MAX_INT32_KOBO)).not.toThrow();
    expect(() => assertLedgerAmount(0, true)).not.toThrow();
    expect(() => assertLedgerAmount(0)).toThrow();
    expect(() => assertLedgerAmount(-1)).toThrow();
  });
  it.each(['wallet', 'escrow'] as const)(
    'accepts exact %s ceiling and rejects one kobo more',
    (scope) => {
      expect(checkedLedgerBalance(MAX_INT32_KOBO - 1, 1, scope)).toBe(MAX_INT32_KOBO);
      expect(() => checkedLedgerBalance(MAX_INT32_KOBO, 1, scope)).toThrow(
        expect.objectContaining({ code: 'BALANCE_LIMIT' }),
      );
      expect(checkedLedgerBalance(MAX_INT32_KOBO, -MAX_INT32_KOBO, scope)).toBe(0);
      expect(() => checkedLedgerBalance(0, -1, scope)).toThrow();
    },
  );
  it('checks every allocation and accumulated sum before permitting a hold', () => {
    expect(() => assertOrderAllocations(MAX_INT32_KOBO, [MAX_INT32_KOBO - 1, 1])).not.toThrow();
    expect(() => assertOrderAllocations(MAX_INT32_KOBO, [MAX_INT32_KOBO, 1])).toThrow(
      expect.objectContaining({ code: 'AMOUNT_LIMIT' }),
    );
    expect(() => assertOrderAllocations(10, [4, 5])).toThrow(
      expect.objectContaining({ code: 'ALLOCATION_MISMATCH' }),
    );
    expect(() => assertOrderAllocations(10, [])).toThrow();
    expect(() => assertOrderAllocations(10, [10, 0])).toThrow();
    expect(() => assertOrderAllocations(10, [11, -1])).toThrow();
  });
  it('requires payment gross and fee+payout to conserve the booking amount', () => {
    expect(() =>
      assertPaymentAllocation(101, { grossAmount: 101, platformFee: 15, usherPayout: 86 }),
    ).not.toThrow();
    expect(() =>
      assertPaymentAllocation(101, { grossAmount: 101, platformFee: 15, usherPayout: 85 }),
    ).toThrow();
    expect(() =>
      assertPaymentAllocation(101, { grossAmount: 100, platformFee: 15, usherPayout: 85 }),
    ).toThrow();
    expect(() =>
      assertPaymentAllocation(101, { grossAmount: 101, platformFee: -1, usherPayout: 102 }),
    ).toThrow();
  });
});
