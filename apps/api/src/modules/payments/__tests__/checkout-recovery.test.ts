import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { confirmBatch } from '../../bookings/service.js';
import { InMemoryPaystack, type CheckoutVerification } from '../port/paystack-port.js';
import { CHECKOUT_TTL_MS, getCheckout, reconcileCheckout, reconcileCheckouts, resumeCheckout } from '../checkout.js';
import { dispatchPaystackEvent } from '../webhooks/paystack-webhook.js';
import { idempotencyStorageKey } from '../ledger/idempotency.js';
import { eraseUser } from '../../privacy/service.js';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../auth/tokens.js';

const users: string[] = [], events: string[] = [], keys: string[] = [];
let isolated = false;
beforeAll(async () => { await assertDisposableDatabase(); isolated = true; });
afterEach(async () => {
  if (!isolated) return;
  const bookings = await prisma.booking.findMany({ where: { eventId: { in: events } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.paymentOperation.deleteMany({ where: { dedupeKey: { in: ids.map((id) => `BOOKING_REFUND:${id}`) } } });
  await prisma.escrowLedger.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { eventId: { in: events } } });
  await prisma.order.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  users.length = 0; events.length = 0; keys.length = 0;
});
class CheckoutFake extends InMemoryPaystack {
  status: CheckoutVerification['status'] = 'abandoned';
  override verifyCheckout(reference: string): Promise<CheckoutVerification> {
    return Promise.resolve({ reference, status: this.status, amountKobo: 10000 });
  }
  override verifyChargeKobo(_reference: string): Promise<{ status: 'success' | 'failed'; amountKobo: number }> {
    return Promise.resolve({ status: this.status === 'success' ? 'success' : 'failed', amountKobo: 10000 });
  }
}
async function fixture() {
  const client = await prisma.user.create({ data: { phone: `checkout-client-${randomUUID()}`, role: 'CLIENT', status: 'ACTIVE', client: { create: { displayName: 'Checkout client' } } }, include: { client: true } });
  const usher = await prisma.user.create({ data: { phone: `checkout-usher-${randomUUID()}`, role: 'USHER', status: 'ACTIVE', usher: { create: { verificationStatus: 'VERIFIED' } } }, include: { usher: true } });
  users.push(client.id, usher.id);
  const event = await prisma.event.create({ data: { clientId: client.client!.id, title: 'Checkout recovery', venue: 'Lagos venue', category: 'Wedding', eventDate: new Date('2030-06-01'), startTime: '10:00', endTime: '18:00', headcount: 1, budgetPerHead: 10000, status: 'OPEN' } });
  events.push(event.id);
  const application = await prisma.application.create({ data: { eventId: event.id, usherId: usher.usher!.id, status: 'ACCEPTED' } });
  const key = randomUUID(); keys.push(idempotencyStorageKey(key, 'order', client.id));
  const params = { idempotencyKey: key, clientUserId: client.id, eventId: event.id, applicationIds: [application.id], email: 'checkout@example.com' };
  const paystack = new CheckoutFake();
  const initialize = vi.spyOn(paystack, 'initializeCharge');
  return { client, usher, event, application, params, paystack, initialize, deps: { prisma, paystack } };
}
const afterExpiry = () => new Date(Date.now() + CHECKOUT_TTL_MS + 10000);

describe('durable checkout recovery and unpaid reservation expiry', () => {
  it('persists reference before initialization and resumes saved URL without a second dispatch', async () => {
    const f = await fixture();
    f.initialize.mockImplementationOnce(async (input) => {
      const checkout = await prisma.checkout.findUniqueOrThrow({ where: { reference: input.reference } });
      expect(checkout.state).toBe('INITIALIZING'); expect(checkout.attemptedAt).not.toBeNull();
      return { reference: input.reference, authorizationUrl: 'https://checkout.paystack.com/original' };
    });
    const first = await confirmBatch(f.deps, f.params);
    const retry = await confirmBatch(f.deps, f.params);
    const restored = await resumeCheckout(f.deps, { orderId: first.orderId, clientUserId: f.client.id });
    expect([retry.orderId, restored.orderId]).toEqual([first.orderId, first.orderId]);
    expect(restored.authorizationUrl).toBe(first.authorizationUrl);
    expect(f.initialize).toHaveBeenCalledTimes(1);
    await expect(getCheckout(f.deps, first.orderId, f.usher.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const api = createApp({ paystack: f.paystack });
    const ownerResponse = await request(api).get(`/api/payments/orders/${first.orderId}/checkout`).set('Authorization', `Bearer ${await signAccessToken(f.client.id, 'CLIENT')}`);
    expect(ownerResponse.status).toBe(200); expect(ownerResponse.body.orderId).toBe(first.orderId);
    expect((await request(api).get(`/api/payments/orders/${first.orderId}/checkout`).set('Authorization', `Bearer ${await signAccessToken(f.usher.id, 'USHER')}`)).status).toBe(403);
  });
  it('lost initialization response retains original order and uncertain reservation across retries and worker checks', async () => {
    const f = await fixture();
    f.paystack.status = 'unknown';
    f.initialize.mockRejectedValueOnce(new Error('response lost'));
    const first = await confirmBatch(f.deps, f.params);
    expect(first.state).toBe('REVIEW');
    await reconcileCheckout(f.deps, first.orderId, afterExpiry());
    const retry = await confirmBatch(f.deps, f.params);
    expect(retry.orderId).toBe(first.orderId); expect(retry.reference).toBe(first.reference);
    expect(retry.state).toBe('REVIEW'); expect(retry.authorizationUrl).toBe('');
    expect(f.initialize).toHaveBeenCalledTimes(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: first.bookingIds[0]! } })).status).toBe('PENDING_PAYMENT');
  });
  it('expires a proven abandoned reservation and a never-dispatched checkpoint without moving money', async () => {
    const f = await fixture();
    const first = await confirmBatch(f.deps, f.params);
    await reconcileCheckout(f.deps, first.orderId, afterExpiry());
    expect((await getCheckout(f.deps, first.orderId, f.client.id)).state).toBe('EXPIRED');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe('OPEN');
    expect(await prisma.escrowLedger.count({ where: { bookingId: { in: first.bookingIds } } })).toBe(0);
    const never = await fixture();
    const saved = await confirmBatch(never.deps, never.params);
    await prisma.checkout.update({ where: { orderId: saved.orderId }, data: { state: 'CREATED', attemptedAt: null, authorizationUrl: null } });
    const verify = vi.spyOn(never.paystack, 'verifyCheckout');
    await reconcileCheckout(never.deps, saved.orderId, afterExpiry());
    expect(verify).not.toHaveBeenCalled();
    expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: saved.orderId } })).state).toBe('EXPIRED');
  });
  it('does not expire ongoing, pending, unknown, reversed, or unavailable provider outcomes', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    for (const status of ['ongoing', 'pending', 'processing', 'queued', 'unknown', 'reversed'] as CheckoutVerification['status'][]) {
      f.paystack.status = status;
      await reconcileCheckout(f.deps, out.orderId, afterExpiry());
      expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: out.orderId } })).state).toBe('REVIEW');
    }
    vi.spyOn(f.paystack, 'verifyCheckout').mockRejectedValueOnce(new Error('not found'));
    await reconcileCheckout(f.deps, out.orderId, afterExpiry());
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: out.bookingIds[0]! } })).status).toBe('PENDING_PAYMENT');
  });
  it('late success creates refundable liability and preserves replacement staffing, including callback replay', async () => {
    const f = await fixture(), replacement = await fixture();
    const expired = await confirmBatch(f.deps, f.params);
    await reconcileCheckout(f.deps, expired.orderId, afterExpiry());
    const application = await prisma.application.create({ data: { eventId: f.event.id, usherId: replacement.usher.usher!.id, status: 'ACCEPTED' } });
    const key = randomUUID(); keys.push(idempotencyStorageKey(key, 'order', f.client.id));
    const next = await confirmBatch(f.deps, { ...f.params, idempotencyKey: key, applicationIds: [application.id] });
    f.paystack.status = 'success';
    keys.push(`paystack_event_id:charge.success:${expired.reference}`);
    const event = { event: 'charge.success', data: { reference: expired.reference } };
    await dispatchPaystackEvent(prisma, event, undefined, f.paystack);
    await dispatchPaystackEvent(prisma, event, undefined, f.paystack);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: expired.orderId } })).state).toBe('REFUND_PENDING');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: expired.bookingIds[0]! } })).status).toBe('CANCELLED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: next.bookingIds[0]! } })).status).toBe('PENDING_PAYMENT');
    expect(await prisma.escrowLedger.count({ where: { bookingId: expired.bookingIds[0]!, entryType: 'HOLD' } })).toBe(1);
    const pendingNotices = await prisma.notification.findMany({ where: { targetType: 'checkout', targetId: expired.orderId } });
    expect(pendingNotices).toHaveLength(1);
    expect(pendingNotices[0]!.body).toContain(expired.orderId);
    expect(pendingNotices[0]!.body).not.toContain('https://');
    await reconcileCheckout(f.deps, expired.orderId);
    await reconcileCheckout(f.deps, expired.orderId);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: expired.orderId } })).state).toBe('REFUNDED');
    expect(await prisma.notification.count({ where: { targetType: 'checkout', targetId: expired.orderId } })).toBe(2);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).status).toBe('FULLY_STAFFED');
  });
  it('success wins expiry and worker recovers an interrupted INITIALIZING checkout', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    await prisma.checkout.update({ where: { orderId: out.orderId }, data: { state: 'INITIALIZING', authorizationUrl: null } });
    f.paystack.status = 'success';
    await reconcileCheckout(f.deps, out.orderId, afterExpiry());
    expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: out.orderId } })).state).toBe('PAID');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: out.bookingIds[0]! } })).status).toBe('CONFIRMED');
  });
  it('a committed charge wins against an expiry worker holding stale abandoned evidence', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    let release!: () => void, inspected!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { inspected = resolve; });
    vi.spyOn(f.paystack, 'verifyCheckout').mockImplementationOnce(async (reference) => {
      const snapshot = { reference, amountKobo: 10000, status: 'abandoned' as const };
      inspected(); await gate; return snapshot;
    });
    const expiration = reconcileCheckout(f.deps, out.orderId, afterExpiry());
    const settled = expiration.then(() => null, (error: unknown) => error);
    await ready;
    try {
      f.paystack.status = 'success';
      keys.push(`paystack_event_id:charge.success:${out.reference}`);
      await dispatchPaystackEvent(prisma, { event: 'charge.success', data: { reference: out.reference } }, undefined, f.paystack);
    } finally { release(); }
    expect(await settled).toBeNull();
    expect((await prisma.checkout.findUniqueOrThrow({ where: { orderId: out.orderId } })).state).toBe('PAID');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: out.bookingIds[0]! } })).status).toBe('CONFIRMED');
    expect(await prisma.escrowLedger.count({ where: { bookingId: out.bookingIds[0]!, entryType: 'HOLD' } })).toBe(1);
  });
  it('backfills old pending orders without dispatch, retaining original reference and uncertainty', async () => {
    const f = await fixture();
    const out = await confirmBatch(f.deps, f.params);
    await prisma.checkout.delete({ where: { orderId: out.orderId } });
    f.paystack.status = 'unknown';
    await reconcileCheckouts(f.deps, afterExpiry());
    const backfilled = await prisma.checkout.findUniqueOrThrow({ where: { orderId: out.orderId } });
    expect(backfilled.reference).toBe(out.reference); expect(backfilled.state).toBe('REVIEW');
    expect(f.initialize).toHaveBeenCalledTimes(1);
  });
  it('an in-flight initialization cannot restore URL/email after erasure; financial recovery still works', async () => {
    const f = await fixture();
    f.initialize.mockImplementationOnce(async (input) => {
      await prisma.$transaction((tx) => eraseUser(tx, f.client.id), { timeout: 30000, maxWait: 30000 });
      return { reference: input.reference, authorizationUrl: 'https://checkout.paystack.com/do-not-restore' };
    });
    const out = await confirmBatch(f.deps, f.params);
    const checkout = await prisma.checkout.findUniqueOrThrow({ where: { orderId: out.orderId } });
    expect(checkout.email).toBe(''); expect(checkout.authorizationUrl).toBeNull();
    f.paystack.status = 'success';
    await reconcileCheckout(f.deps, out.orderId);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: out.orderId } })).status).toBe('PAID');
  });
});
