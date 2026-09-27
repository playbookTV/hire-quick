import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@hq/database';
import { paystackWebhookRouter } from './paystack-webhook.js';

const secret = 'local-webhook-unit-secret';
function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { paymentOperation: { findMany } } as unknown as PrismaClient;
  const app = express();
  app.use('/webhook', express.raw({ type: 'application/json' }), paystackWebhookRouter({ prisma, secret }));
  return { app, findMany };
}
function post(app: express.Express, body: unknown, validSignature = true) {
  const raw = JSON.stringify(body);
  return request(app).post('/webhook').set('Content-Type', 'application/json')
    .set('x-paystack-signature', validSignature ? createHmac('sha512', secret).update(raw).digest('hex') : 'invalid')
    .send(raw);
}

describe('signed webhook payload validation', () => {
  it('accepts the documented refund amount string and correlates the charge reference', async () => {
    const { app, findMany } = fixture();
    expect((await post(app, {
      event: 'refund.processed', data: { amount: '10000', currency: 'NGN', transaction_reference: 'hq-test-charge' },
    })).status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ payload: { path: ['chargeReference'], equals: 'hq-test-charge' } }),
    }));
  });
  it.each([null, { event: 'transfer.success' }, { event: 'refund.processed', data: { amount: '1.5' } },
    { event: 'refund.processed', data: { amount: '9007199254740992' } }])('rejects malformed signed bodies before any lookup: %j', async body => {
    const { app, findMany } = fixture();
    expect((await post(app, body)).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('rejects an invalid signature before looking up an otherwise valid event', async () => {
    const { app, findMany } = fixture();
    expect((await post(app, { event: 'refund.processed', data: { merchant_note: 'BOOKING_REFUND:test' } }, false)).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
