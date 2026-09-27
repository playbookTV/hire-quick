/** Storage-safe integer kobo guards; no rounding, clamping or implicit casts. */
import { MAX_INT32_KOBO } from '@hq/shared';

export class LedgerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/** Signed entries use a symmetric range; a positive reversal must fit too. */
export function assertSignedLedgerAmount(amount: number): void {
  if (!Number.isSafeInteger(amount))
    throw new LedgerError('BAD_AMOUNT', 'ledger amount must be integer kobo');
  if (Math.abs(amount) > MAX_INT32_KOBO)
    throw new LedgerError('AMOUNT_LIMIT', 'ledger amount exceeds the supported integer limit');
}

export function assertLedgerAmount(amount: number, allowZero = false): void {
  assertSignedLedgerAmount(amount);
  if (amount < 0 || (!allowZero && amount === 0))
    throw new LedgerError(
      'BAD_AMOUNT',
      allowZero ? 'amount must not be negative' : 'amount must be positive',
    );
}

export function checkedLedgerBalance(
  previous: number,
  amount: number,
  scope: 'wallet' | 'escrow',
): number {
  assertLedgerAmount(previous, true);
  assertSignedLedgerAmount(amount);
  const next = previous + amount; // both Int32-bounded operands: addition is exact in JS.
  if (next < 0)
    throw new LedgerError(
      scope === 'wallet' ? 'NEGATIVE_WALLET' : 'NEGATIVE_ESCROW',
      `${scope} balance cannot go negative`,
    );
  if (next > MAX_INT32_KOBO)
    throw new LedgerError(
      'BALANCE_LIMIT',
      `${scope} balance limit reached; operator review and retry required`,
    );
  return next;
}

/** Validate the whole allocation before any HOLD, including cumulative overflow. */
export function assertOrderAllocations(grossAmount: number, allocations: readonly number[]): void {
  assertLedgerAmount(grossAmount);
  if (!allocations.length)
    throw new LedgerError('ALLOCATION_MISMATCH', 'order must have booking allocations');
  let total = 0;
  for (const amount of allocations) {
    assertLedgerAmount(amount);
    total += amount;
    if (total > MAX_INT32_KOBO)
      throw new LedgerError('AMOUNT_LIMIT', 'order allocations exceed the supported integer limit');
  }
  if (total !== grossAmount)
    throw new LedgerError('ALLOCATION_MISMATCH', 'booking allocations do not equal order gross');
}

export function assertPaymentAllocation(
  bookingAmount: number,
  payment: { grossAmount: number; platformFee: number; usherPayout: number },
): void {
  assertLedgerAmount(bookingAmount);
  assertLedgerAmount(payment.grossAmount);
  assertLedgerAmount(payment.platformFee, true);
  assertLedgerAmount(payment.usherPayout, true);
  if (
    bookingAmount !== payment.grossAmount ||
    payment.platformFee + payment.usherPayout !== payment.grossAmount
  ) {
    throw new LedgerError(
      'ALLOCATION_MISMATCH',
      'payment allocation does not conserve booking gross',
    );
  }
}
