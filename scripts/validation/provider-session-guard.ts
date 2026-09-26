import { strict as assert } from 'node:assert';

export type ProviderPostPlan = {
  path: '/transaction/initialize' | '/refund' | '/transfer';
  reference: string;
  amount: number;
  recipient?: string;
  chargeReference?: string;
};

/** Validate the exact bounded operation before persisting a dispatch reservation. */
export function reserveProviderPost(
  secret: string,
  url: string,
  body: Record<string, unknown>,
  plan: ProviderPostPlan,
  attempted: string[],
): string {
  assert.ok(/^sk_test_[A-Za-z0-9]+$/.test(secret), 'Only a TEST key is permitted');
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://api.paystack.co');
  assert.equal(parsed.pathname, plan.path);
  assert.equal(parsed.search, '');
  assert.equal(body.currency, 'NGN');
  assert.ok(Number.isSafeInteger(plan.amount) && plan.amount > 0 && plan.amount <= 200_000);
  assert.equal(body.amount, plan.amount);
  if (plan.path === '/refund') {
    assert.ok(plan.chargeReference);
    assert.equal(body.transaction, plan.chargeReference);
    assert.equal(body.merchant_note, plan.reference);
  } else {
    assert.equal(body.reference, plan.reference);
    if (plan.path === '/transfer') {
      assert.ok(plan.recipient);
      assert.equal(body.recipient, plan.recipient);
      assert.equal(body.source, 'balance');
    }
  }
  const identity = `${plan.path}:${plan.reference}`;
  assert.ok(
    !attempted.includes(identity),
    'Repeated/ambiguous dispatch requires GET-only investigation',
  );
  return identity;
}
