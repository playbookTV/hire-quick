import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { verifyPaystackSignature } from '../webhooks/paystack-webhook.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

const SECRET = 'test_webhook_secret';
const paystack = new InMemoryPaystack();
const app = createApp({ paystack, paystackSecret: SECRET });

function sign(body: string): string {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});

describe('paystack webhook pipeline (TRD §10)', () => {
  it('verifyPaystackSignature accepts a correct signature and rejects a bad one', () => {
    const body = Buffer.from('{"hello":"world"}');
    expect(verifyPaystackSignature(body, sign(body.toString()), SECRET)).toBe(true);
    expect(verifyPaystackSignature(body, 'deadbeef', SECRET)).toBe(false);
  });

  it('charge.success holds the order; bad signature is 401; replay is deduped', async () => {
    scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
    const ref = `hq_${scenario.orderId}`;
    await prisma.order.update({ where: { id: scenario.orderId }, data: { paystackChargeRef: ref } });
    // The webhook now re-verifies the charge server-side; seed the fake's record
    // for this reference (the real flow records it at charge initialization).
    const seeded = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
    paystack.recordCharge(ref, seeded.grossAmount);

    const payload = JSON.stringify({ event: 'charge.success', data: { id: 99, reference: ref, status: 'success' } });

    // bad signature → 401, no effect
    const bad = await request(app)
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'nope')
      .send(payload);
    expect(bad.status).toBe(401);

    // valid → 200 and the order is held
    const ok = await request(app)
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(payload))
      .send(payload);
    expect(ok.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe('PAID');
    const holds = await prisma.escrowLedger.count({
      where: { bookingId: { in: scenario.bookingIds }, entryType: 'HOLD' },
    });
    expect(holds).toBe(2);

    // replay the same event → still 200, no double hold
    const replay = await request(app)
      .post('/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sign(payload))
      .send(payload);
    expect(replay.status).toBe(200);
    const holdsAfter = await prisma.escrowLedger.count({
      where: { bookingId: { in: scenario.bookingIds }, entryType: 'HOLD' },
    });
    expect(holdsAfter).toBe(2);

    await prisma.idempotencyKey.deleteMany({ where: { key: `charge.success:${ref}` } });
  });
});
