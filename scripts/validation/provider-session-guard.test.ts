import { describe, expect, it } from 'vitest';
import { reserveProviderPost, type ProviderPostPlan } from './provider-session-guard.js';

const plan: ProviderPostPlan = {
  path: '/transfer',
  reference: 'wd_test',
  amount: 85_000,
  recipient: 'RCP_test',
};
const request = {
  reference: 'wd_test',
  amount: 85_000,
  recipient: 'RCP_test',
  currency: 'NGN',
  source: 'balance',
};
describe('actual TEST session dispatch bounds', () => {
  it('rejects live credentials without exposing them', () => {
    expect(() =>
      reserveProviderPost('sk_live_private', 'https://api.paystack.co/transfer', request, plan, []),
    ).toThrow('Only a TEST key is permitted');
  });
  it.each([
    { amount: 85_001 },
    { currency: 'USD' },
    { recipient: 'RCP_foreign' },
    { reference: 'wd_fresh' },
    { source: 'other' },
  ])('rejects a changed transfer: %j', (change) => {
    expect(() =>
      reserveProviderPost(
        'sk_test_fixture',
        'https://api.paystack.co/transfer',
        { ...request, ...change },
        plan,
        [],
      ),
    ).toThrow();
  });
  it.each([
    'https://foreign.invalid/transfer',
    'https://api.paystack.co/transfer/finalize_transfer',
    'https://api.paystack.co/transfer?extra=1',
  ])('rejects endpoint changes: %s', (url) => {
    expect(() => reserveProviderPost('sk_test_fixture', url, request, plan, [])).toThrow();
  });
  it('retains at-most-once dispatch after restart or response loss', () => {
    const identity = reserveProviderPost(
      'sk_test_fixture',
      'https://api.paystack.co/transfer',
      request,
      plan,
      [],
    );
    const persisted: string[] = JSON.parse(JSON.stringify([identity])) as string[];
    expect(() =>
      reserveProviderPost(
        'sk_test_fixture',
        'https://api.paystack.co/transfer',
        request,
        plan,
        persisted,
      ),
    ).toThrow('GET-only');
  });
  it('binds refunds to the original charge and merchant note', () => {
    const refund: ProviderPostPlan = {
      path: '/refund',
      reference: 'BOOKING_REFUND:b',
      chargeReference: 'hq-original',
      amount: 100_000,
    };
    const body = {
      transaction: 'hq-original',
      merchant_note: refund.reference,
      amount: 100_000,
      currency: 'NGN',
    };
    expect(
      reserveProviderPost('sk_test_fixture', 'https://api.paystack.co/refund', body, refund, []),
    ).toBe('/refund:BOOKING_REFUND:b');
    expect(() =>
      reserveProviderPost(
        'sk_test_fixture',
        'https://api.paystack.co/refund',
        { ...body, transaction: 'hq-other' },
        refund,
        [],
      ),
    ).toThrow();
    expect(() =>
      reserveProviderPost(
        'sk_test_fixture',
        'https://api.paystack.co/refund',
        { ...body, merchant_note: 'new' },
        refund,
        [],
      ),
    ).toThrow();
  });
  it('caps every dispatch at the fixed simulated checkout budget', () => {
    expect(() =>
      reserveProviderPost(
        'sk_test_fixture',
        'https://api.paystack.co/transfer',
        { ...request, amount: 200_001 },
        { ...plan, amount: 200_001 },
        [],
      ),
    ).toThrow();
  });
});
