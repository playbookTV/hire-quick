import { describe, expect, it } from 'vitest';
import {
  formatPayoutDate,
  isPayoutTransfer,
  isWeeklyPayouts,
  maskedAccountLabel,
  nextPayoutDate,
  payoutAmountLabel,
  payoutModeOf,
  payoutPlan,
  payoutPlanCopy,
  payoutRunToday,
} from '../payouts.js';

const account = { id: 'a1', bankCode: '058', accountName: 'ADA OBI', last4: '1234' };

describe('payout mode', () => {
  it('treats a wallet without a mode (older API) as on demand', () => {
    expect(payoutModeOf({})).toBe('on_demand');
    expect(payoutModeOf(undefined)).toBe('on_demand');
    expect(isWeeklyPayouts({ payoutMode: 'on_demand' })).toBe(false);
    expect(isWeeklyPayouts({ payoutMode: 'weekly' })).toBe(true);
  });
});

describe('next payout date', () => {
  // Friday 23 October 2026; the next run is Thursday 29 October, 08:00 UTC.
  const friday = new Date('2026-10-23T10:00:00Z');

  it('uses the server value when it is still ahead', () => {
    const at = nextPayoutDate({ nextPayoutAt: '2026-10-29T08:00:00.000Z' }, friday);
    expect(at.toISOString()).toBe('2026-10-29T08:00:00.000Z');
  });

  it('recomputes a server value a cached wallet has already passed', () => {
    const after = new Date('2026-10-29T09:00:00Z');
    const at = nextPayoutDate({ nextPayoutAt: '2026-10-29T08:00:00.000Z' }, after);
    expect(at.toISOString()).toBe('2026-11-05T08:00:00.000Z');
  });

  it('computes the run when the server sent none or garbage', () => {
    expect(nextPayoutDate({}, friday).toISOString()).toBe('2026-10-29T08:00:00.000Z');
    expect(nextPayoutDate({ nextPayoutAt: 'soon' }, friday).toISOString()).toBe(
      '2026-10-29T08:00:00.000Z',
    );
  });
});

describe('formatPayoutDate', () => {
  const run = new Date('2026-10-29T08:00:00.000Z');

  it('shows the weekday and date in Lagos time', () => {
    expect(formatPayoutDate(run, new Date('2026-10-23T10:00:00Z'))).toBe('Thu 29 Oct · 9:00 AM');
  });

  it('says tomorrow and today by the Lagos calendar, not UTC', () => {
    expect(formatPayoutDate(run, new Date('2026-10-28T12:00:00Z'))).toBe('Tomorrow · 9:00 AM');
    // 23:30 UTC on Wednesday is already 00:30 Thursday in Lagos.
    expect(formatPayoutDate(run, new Date('2026-10-28T23:30:00Z'))).toBe('Today · 9:00 AM');
    expect(formatPayoutDate(run, new Date('2026-10-29T07:30:00Z'))).toBe('Today · 9:00 AM');
  });
});

describe('payoutRunToday', () => {
  it('is true on Thursday from 09:00 until midnight in Lagos', () => {
    expect(payoutRunToday(new Date('2026-10-29T07:59:00Z'))).toBe(false);
    expect(payoutRunToday(new Date('2026-10-29T08:00:00Z'))).toBe(true);
    expect(payoutRunToday(new Date('2026-10-29T22:59:00Z'))).toBe(true);
    expect(payoutRunToday(new Date('2026-10-29T23:00:00Z'))).toBe(false);
    expect(payoutRunToday(new Date('2026-10-23T10:00:00Z'))).toBe(false);
  });
});

describe('payoutPlan', () => {
  it('schedules the whole balance once it reaches the minimum', () => {
    const plan = payoutPlan({
      availableBalance: 100_000,
      payoutMinimumKobo: 100_000,
      payoutAccount: account,
    });
    expect(plan).toEqual({
      status: 'scheduled',
      amountKobo: 100_000,
      minimumKobo: 100_000,
      shortfallKobo: 0,
    });
    expect(payoutAmountLabel(plan)).toBe('₦1,000.00');
  });

  it('rolls a balance under the minimum over and says how much is missing', () => {
    const plan = payoutPlan({ availableBalance: 75_050, payoutAccount: account });
    expect(plan.status).toBe('below-minimum');
    expect(plan.minimumKobo).toBe(100_000);
    expect(plan.shortfallKobo).toBe(24_950);
    expect(payoutAmountLabel(plan)).toBe('None this week');
    expect(payoutPlanCopy(plan).message).toContain('₦249.50 to go');
  });

  it('reports an empty wallet separately from a small balance', () => {
    expect(payoutPlan({ availableBalance: 0, payoutAccount: account }).status).toBe('empty');
  });

  it('asks for a payout account before anything else', () => {
    for (const availableBalance of [0, 50_000, 500_000]) {
      const plan = payoutPlan({ availableBalance, payoutAccount: null });
      expect(plan.status).toBe('no-account');
      expect(payoutPlanCopy(plan)).toMatchObject({
        tone: 'warning',
        title: 'Add a payout account',
      });
    }
    expect(payoutPlan({ availableBalance: 500_000 }).status).toBe('no-account');
  });
});

describe('maskedAccountLabel', () => {
  it('names the bank once the bank list is loaded', () => {
    const banks = [{ code: '058', name: 'Guaranty Trust Bank' }];
    expect(maskedAccountLabel('058', '1234', banks)).toBe('Guaranty Trust Bank ••1234');
    expect(maskedAccountLabel('058', '1234', undefined)).toBe('Bank 058 ••1234');
  });
});

describe('isPayoutTransfer', () => {
  it('trusts the source the API reports', () => {
    const weekly = { payoutMode: 'weekly' as const };
    expect(isPayoutTransfer({ source: 'PAYOUT_RUN' }, undefined)).toBe(true);
    expect(isPayoutTransfer({ source: 'USHER_REQUEST' }, weekly)).toBe(false);
  });

  it('falls back to the payout mode when the API sends no source', () => {
    expect(isPayoutTransfer({}, { payoutMode: 'weekly' })).toBe(true);
    expect(isPayoutTransfer(undefined, { payoutMode: 'on_demand' })).toBe(false);
  });
});
