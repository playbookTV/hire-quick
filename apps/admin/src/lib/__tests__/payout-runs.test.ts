import { describe, expect, it } from 'vitest';
import { lineAwaitsCode, lineStatus, runActions, type PayoutRunLineView } from '../payout-runs';

const line = (over: Partial<PayoutRunLineView> = {}): PayoutRunLineView => ({
  usherId: 'u1',
  usherName: 'Ada',
  amountKobo: 150_000,
  flags: [],
  bank: { bankCode: '058', accountName: 'ADA O', last4: '6789' },
  withdrawal: null,
  skipReason: null,
  ...over,
});
const withdrawal = (status: 'PROCESSING' | 'PAID' | 'FAILED') => ({
  id: 'w1',
  status,
  amountKobo: 150_000,
  reference: 'wd_w1',
  updatedAt: '2026-10-29T08:05:00Z',
});

describe('payout run view model', () => {
  it('describes each line outcome in operator terms', () => {
    expect(lineStatus(line(), 'DRAFT')).toBe('Not sent yet');
    expect(lineStatus(line({ withdrawal: withdrawal('PROCESSING') }), 'EXECUTED')).toBe('Waiting for code or bank');
    expect(lineStatus(line({ withdrawal: withdrawal('PAID') }), 'EXECUTED')).toBe('Paid');
    expect(lineStatus(line({ withdrawal: withdrawal('FAILED') }), 'EXECUTED')).toBe('Failed · back in wallet');
    expect(lineStatus(line({ skipReason: 'USER_SUSPENDED' }), 'EXECUTED')).toBe('Not sent · account suspended');
  });

  it('offers a code entry only while a transfer is unsettled', () => {
    expect(lineAwaitsCode(line({ withdrawal: withdrawal('PROCESSING') }))).toBe(true);
    expect(lineAwaitsCode(line({ withdrawal: withdrawal('PAID') }))).toBe(false);
    expect(lineAwaitsCode(line())).toBe(false);
  });

  it('allows each step only in its state', () => {
    expect(runActions({ status: 'DRAFT', lines: [] })).toMatchObject({ submit: false, refresh: true, approve: false });
    expect(runActions({ status: 'DRAFT', lines: [line()] }).submit).toBe(true);
    expect(runActions({ status: 'AWAITING_APPROVAL', lines: [line()] })).toMatchObject({ approve: true, sendBack: true, submit: false });
    expect(runActions({ status: 'EXECUTED', lines: [line({ withdrawal: withdrawal('PAID') })] }).sendAgain).toBe(false);
    expect(runActions({ status: 'EXECUTED', lines: [line({ withdrawal: withdrawal('PROCESSING') })] }).sendAgain).toBe(true);
    expect(runActions({ status: 'CANCELLED', lines: [line()] })).toMatchObject({ submit: false, approve: false, cancel: false });
  });
});
