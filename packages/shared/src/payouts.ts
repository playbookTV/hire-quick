/**
 * Weekly usher payouts (decisions record 2026-10-23). HireQuick pays each usher
 * their whole wallet balance in one transfer per weekly run. Amounts are kobo.
 */

/** Lagos is UTC+1 all year (no daylight saving), matching `eventInstant`. */
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Balances below this roll over to the next run (₦1,000). */
export const PAYOUT_MIN_KOBO = 100_000;
/** Payday: Thursday (0 = Sunday), with the run built at 09:00 Lagos time. */
export const PAYOUT_WEEKDAY = 4;
export const PAYOUT_HOUR_LAGOS = 9;
/** A payout account chosen this recently is flagged for the approver to check. */
export const PAYOUT_ACCOUNT_REVIEW_DAYS = 7;
/** Phase 2 automatic-execution caps (not used while every run is approved by admins). */
export const PAYOUT_AUTO_MAX_RUN_KOBO = 200_000_000;
export const PAYOUT_AUTO_MAX_LINE_KOBO = 20_000_000;

export const PAYOUT_RUN_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTED',
  'CANCELLED',
] as const;
export type PayoutRunStatus = (typeof PAYOUT_RUN_STATUSES)[number];

/** Why an usher with a balance is left out of a run (their balance rolls over). */
export const PAYOUT_EXCLUSION_REASONS = [
  'BELOW_MINIMUM',
  'NO_PAYOUT_ACCOUNT',
  'ACCOUNT_NOT_VERIFIED',
  'ACCOUNT_NOT_BVN_VERIFIED',
  'NO_TRANSFER_RECIPIENT',
  'USER_SUSPENDED',
  'USER_CLOSED',
] as const;
export type PayoutExclusionReason = (typeof PAYOUT_EXCLUSION_REASONS)[number];

/** Included lines the approver should look at before approving. */
export const PAYOUT_LINE_FLAGS = ['NEW_PAYOUT_ACCOUNT', 'FIRST_PAYOUT'] as const;
export type PayoutLineFlag = (typeof PAYOUT_LINE_FLAGS)[number];

/** Why an approved line was not sent when the run executed (its balance stays in the wallet). */
export const PAYOUT_SKIP_REASONS = [
  'ACCOUNT_CHANGED',
  'INSUFFICIENT_BALANCE',
  'USER_SUSPENDED',
  'USER_CLOSED',
] as const;
export type PayoutSkipReason = (typeof PAYOUT_SKIP_REASONS)[number];

export interface PayoutSkip {
  usherId: string;
  walletId: string;
  amountKobo: number;
  reason: PayoutSkipReason;
}

export interface PayoutLine {
  usherId: string;
  walletId: string;
  bankAccountId: string;
  recipientCode: string;
  amountKobo: number;
  flags: PayoutLineFlag[];
}

export interface PayoutExclusion {
  usherId: string;
  balanceKobo: number;
  reason: PayoutExclusionReason;
}

/** The Lagos calendar date (YYYY-MM-DD) of an instant; one run per date. */
export function lagosDateKey(at: Date): string {
  return new Date(at.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next scheduled run at or after `now`: Thursday 09:00 Lagos (08:00 UTC). */
export function nextPayoutAt(now: Date): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const midnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  const daysAhead = (PAYOUT_WEEKDAY - lagos.getUTCDay() + 7) % 7;
  let at = midnight + daysAhead * DAY_MS + PAYOUT_HOUR_LAGOS * 3_600_000 - LAGOS_OFFSET_MS;
  if (at <= now.getTime()) at += 7 * DAY_MS;
  return new Date(at);
}

/** Total of a run's lines. Computed, because a week's total can exceed Int32 kobo. */
export function payoutRunTotal(lines: readonly Pick<PayoutLine, 'amountKobo'>[]): number {
  return lines.reduce((sum, line) => sum + line.amountKobo, 0);
}
