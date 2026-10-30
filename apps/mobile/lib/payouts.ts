/**
 * Weekly payout runs (decisions record 2026-10-23): every Thursday at 09:00
 * Lagos time HireQuick builds a run that pays each usher's whole available
 * balance to their payout account, once an admin approves it. Balances under
 * the minimum roll over. Pure helpers so the wallet copy is unit-tested.
 */
import { PAYOUT_MIN_KOBO, PAYOUT_WEEKDAY, PAYOUT_HOUR_LAGOS, nextPayoutAt } from '@hq/shared';
import { money } from './format.js';
import type { Bank, PayoutMode, TransferSource, WalletSummary } from './types.js';

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** An API older than the weekly-payout release sends no mode: treat it as on demand. */
export function payoutModeOf(wallet: Pick<WalletSummary, 'payoutMode'> | undefined): PayoutMode {
  return wallet?.payoutMode === 'weekly' ? 'weekly' : 'on_demand';
}

export function isWeeklyPayouts(wallet: Pick<WalletSummary, 'payoutMode'> | undefined): boolean {
  return payoutModeOf(wallet) === 'weekly';
}

/**
 * Whether a transfer record is a weekly payout rather than a withdrawal. The
 * API reports its source; for an older API that does not, the mode stands in.
 */
export function isPayoutTransfer(
  record: { source?: TransferSource } | undefined,
  wallet: Pick<WalletSummary, 'payoutMode'> | undefined,
): boolean {
  return record?.source ? record.source === 'PAYOUT_RUN' : isWeeklyPayouts(wallet);
}

/** The instant shifted so its UTC fields read as Lagos wall-clock time. */
function lagosClock(at: Date): Date {
  return new Date(at.getTime() + LAGOS_OFFSET_MS);
}

function lagosDayNumber(at: Date): number {
  return Math.floor(lagosClock(at).getTime() / DAY_MS);
}

/** "9:00 AM" in Lagos time. */
function lagosTime(at: Date): string {
  const clock = lagosClock(at);
  const h = clock.getUTCHours();
  const m = clock.getUTCMinutes().toString().padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The next run time. The server's value wins, but a cached wallet can be
 * fetched before a run and read after it, so a past value is recomputed.
 */
export function nextPayoutDate(wallet: Pick<WalletSummary, 'nextPayoutAt'>, now: Date): Date {
  const server = wallet.nextPayoutAt ? new Date(wallet.nextPayoutAt) : null;
  if (server && !Number.isNaN(server.getTime()) && server.getTime() > now.getTime()) return server;
  return nextPayoutAt(now);
}

/**
 * "Today · 9:00 AM", "Tomorrow · 9:00 AM" or "Thu 29 Oct · 9:00 AM", in Lagos
 * time whatever the phone's time zone is.
 */
export function formatPayoutDate(at: Date, now: Date): string {
  const days = lagosDayNumber(at) - lagosDayNumber(now);
  const clock = lagosClock(at);
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : `${DAYS[clock.getUTCDay()]} ${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]}`;
  return `${day} · ${lagosTime(at)}`;
}

/** True on Thursday from 09:00 Lagos, while that day's run is being approved and sent. */
export function payoutRunToday(now: Date): boolean {
  const clock = lagosClock(now);
  return clock.getUTCDay() === PAYOUT_WEEKDAY && clock.getUTCHours() >= PAYOUT_HOUR_LAGOS;
}

export type PayoutPlanStatus = 'no-account' | 'empty' | 'below-minimum' | 'scheduled';

export interface PayoutPlan {
  status: PayoutPlanStatus;
  /** What the run would pay if it were built now: the whole available balance. */
  amountKobo: number;
  minimumKobo: number;
  /** How much more must be released before the balance is paid (below-minimum only). */
  shortfallKobo: number;
}

/**
 * What the next run will do for this usher. A missing payout account comes
 * first because it is the only state the usher must act on.
 */
export function payoutPlan(
  wallet: Pick<WalletSummary, 'availableBalance' | 'payoutMinimumKobo' | 'payoutAccount'>,
): PayoutPlan {
  const amountKobo = Math.max(0, wallet.availableBalance);
  const minimumKobo = wallet.payoutMinimumKobo ?? PAYOUT_MIN_KOBO;
  const base = { amountKobo, minimumKobo, shortfallKobo: 0 };
  if (!wallet.payoutAccount) return { ...base, status: 'no-account' };
  if (amountKobo === 0) return { ...base, status: 'empty' };
  if (amountKobo < minimumKobo)
    return { ...base, status: 'below-minimum', shortfallKobo: minimumKobo - amountKobo };
  return { ...base, status: 'scheduled' };
}

/** The amount row of the next-payout card; the banner below it says why it is empty. */
export function payoutAmountLabel(plan: PayoutPlan): string {
  return plan.status === 'scheduled' ? money(plan.amountKobo) : 'None this week';
}

/** "Access Bank ••1234"; the bank code stands in until the bank list loads. */
export function maskedAccountLabel(
  bankCode: string,
  last4: string,
  banks: readonly Pick<Bank, 'code' | 'name'>[] | undefined,
): string {
  const name = banks?.find((b) => b.code === bankCode)?.name ?? `Bank ${bankCode}`;
  return `${name} ••${last4}`;
}

export interface PayoutPlanCopy {
  tone: 'success' | 'info' | 'warning';
  title?: string;
  message: string;
}

/** Plain explanation shown under the next-payout card. */
export function payoutPlanCopy(plan: PayoutPlan): PayoutPlanCopy {
  switch (plan.status) {
    case 'no-account':
      return {
        tone: 'warning',
        title: 'Add a payout account',
        message:
          'We need a bank account to send your weekly payout. Your balance stays in your wallet until you add one.',
      };
    case 'empty':
      return {
        tone: 'info',
        message:
          'Nothing to pay yet. Earnings released to your wallet before payout day are included.',
      };
    case 'below-minimum':
      return {
        tone: 'info',
        title: `Payouts start at ${money(plan.minimumKobo)}`,
        message: `Your balance rolls over to the next payout until it reaches ${money(plan.minimumKobo)}. ${money(plan.shortfallKobo)} to go.`,
      };
    case 'scheduled':
      return {
        tone: 'success',
        message:
          'Your whole available balance on payout day is sent to this account, with no fee. Transfers go out after our team approves the payout.',
      };
  }
}
