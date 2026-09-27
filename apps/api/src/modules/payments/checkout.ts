import type { Prisma, PrismaClient } from '@hq/database';
import { checkoutResponseSchema, type CheckoutResponse } from '@hq/shared';
import { ApiError } from '../../app.js';
import { lockOrderLifecycle } from '../events/staffing.js';
import { expireUnpaidOrder, holdExpiredOrderForRefund, holdOrder } from './ledger/ledger.js';
import { driveRefund, type Deps } from './service.js';
import type { CheckoutVerification } from './port/paystack-port.js';
import { noopGateway, type RealtimeGateway } from '../../realtime/gateway.js';
import { RT, bookingEvent } from '../../realtime/events.js';
import { notifyBookingConfirmed } from '../notifications/service.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
export const CHECKOUT_TTL_MS = 30 * 60_000;
type Tx = Prisma.TransactionClient;

async function activeCheckoutOwner(tx: Tx, orderId: string): Promise<boolean> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { client: true } });
  const userId = order.client.userId;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
  return (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } })).status === 'ACTIVE';
}

export async function notifyCheckoutHeld(prisma: PrismaClient, orderId: string, realtime: RealtimeGateway = noopGateway): Promise<void> {
  const bookings = await prisma.booking.findMany({ where: { orderId }, include: { usher: true, event: { include: { client: true } } } });
  for (const booking of bookings) {
    notifyBookingConfirmed(booking.usher.userId);
    const payload = bookingEvent(booking.id, 'CONFIRMED');
    realtime.emitToUser(booking.usher.userId, RT.BOOKING_CONFIRMED, payload);
    realtime.emitToUser(booking.event.client.userId, RT.BOOKING_CONFIRMED, payload);
  }
  const owner = bookings[0]?.event.client.userId;
  if (owner) realtime.emitToUser(owner, RT.ORDER_PAID, { orderId, at: new Date().toISOString() });
}

async function ownerOrder(prisma: PrismaClient, orderId: string, userId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { client: true } });
  if (order.client.userId !== userId) throw new ApiError(403, 'FORBIDDEN', 'not your order');
  return order;
}

/** Legacy initialization may already have reached Paystack. Never infer safe dispatch from a missing URL. */
async function ensureCheckout(prisma: PrismaClient, orderId: string, email = ''): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrderLifecycle(tx, orderId);
    if (await tx.checkout.findUnique({ where: { orderId } })) return;
    const active = await activeCheckoutOwner(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const reference = order.paystackChargeRef ?? `hq-${order.id}`;
    await tx.order.update({ where: { id: order.id }, data: { paystackChargeRef: reference } });
    await tx.checkout.create({ data: {
      orderId, reference, email: active ? email : '', state: order.status === 'PENDING' ? 'REVIEW' : order.status === 'REFUNDED' ? 'REFUNDED' : 'PAID',
      attemptedAt: order.createdAt, expiresAt: new Date(order.createdAt.getTime() + CHECKOUT_TTL_MS),
    } });
  }, TX);
}

export async function checkoutSnapshot(prisma: PrismaClient, orderId: string, duplicate = true): Promise<CheckoutResponse> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { checkout: true, bookings: { orderBy: { id: 'asc' } } } });
  const checkout = order.checkout;
  if (!checkout) throw new ApiError(500, 'CHECKOUT_OUTCOME_UNAVAILABLE', 'checkout recovery is unavailable');
  const state = checkout.state === 'REFUND_PENDING' && order.status === 'REFUNDED' ? 'REFUNDED' : checkout.state;
  const result = checkoutResponseSchema.safeParse({
    orderId, eventId: order.eventId, bookingIds: order.bookings.map((b) => b.id),
    reference: checkout.reference, authorizationUrl: state === 'READY' ? checkout.authorizationUrl ?? '' : '',
    state, expiresAt: checkout.expiresAt.toISOString(), amountKobo: order.grossAmount, duplicate,
  });
  if (!result.success) throw new ApiError(500, 'CHECKOUT_OUTCOME_UNAVAILABLE', 'checkout outcome is unavailable; resume the saved request');
  return result.data;
}

/** Charge and late-charge refund intents commit together; caller already verified reference/currency/amount. */
export async function recordCheckoutCharge(tx: Tx, orderId: string, reference: string): Promise<'held' | 'refund' | 'duplicate'> {
  await lockOrderLifecycle(tx, orderId);
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { checkout: true, bookings: true } });
  if (order.paystackChargeRef !== reference || (order.checkout && order.checkout.reference !== reference))
    throw new ApiError(409, 'CHARGE_REFERENCE_MISMATCH', 'charge does not match order');
  if (order.status !== 'PENDING') return 'duplicate';
  if (order.checkout?.state === 'EXPIRED') {
    const active = await activeCheckoutOwner(tx, orderId);
    await holdExpiredOrderForRefund(tx, orderId, reference);
    for (const booking of order.bookings) {
      // The expired allocation has never been eligible for a prior refund.
      await tx.paymentOperation.create({ data: {
        kind: 'BOOKING_REFUND', dedupeKey: `BOOKING_REFUND:${booking.id}`,
        payload: { bookingId: booking.id, amountKobo: booking.amount, precursor: null, chargeReference: reference },
      } });
    }
    await tx.checkout.update({ where: { orderId }, data: { state: 'REFUND_PENDING', authorizationUrl: null } });
    if (active) {
      const client = await tx.client.findUniqueOrThrow({ where: { id: order.clientId } });
      await tx.notification.create({ data: { userId: client.userId, type: 'CHECKOUT_UPDATED', targetType: 'checkout', targetId: orderId,
        title: 'Late payment: refund pending', body: `Payment for expired order ${orderId} arrived. Staff were not confirmed; your refund is being processed.` } });
    }
    return 'refund';
  }
  await holdOrder(tx, orderId, reference);
  if (order.checkout) await tx.checkout.update({ where: { orderId }, data: { state: 'PAID', authorizationUrl: null } });
  return 'held';
}

async function finishLateRefunds(deps: Deps, orderId: string): Promise<void> {
  const bookings = await deps.prisma.booking.findMany({ where: { orderId }, select: { id: true } });
  const operations = await deps.prisma.paymentOperation.findMany({ where: { dedupeKey: { in: bookings.map((b) => `BOOKING_REFUND:${b.id}`) }, status: { in: ['PENDING', 'PROVIDER_OK'] } } });
  for (const operation of operations) await driveRefund(deps, operation);
  await deps.prisma.$transaction(async (tx) => {
    await lockOrderLifecycle(tx, orderId);
    const active = await activeCheckoutOwner(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { checkout: true, client: true } });
    if (order.status !== 'REFUNDED' || order.checkout?.state !== 'REFUND_PENDING') return;
    await tx.checkout.update({ where: { orderId }, data: { state: 'REFUNDED' } });
    if (active) await tx.notification.create({ data: { userId: order.client.userId, type: 'CHECKOUT_UPDATED', targetType: 'checkout', targetId: orderId,
      title: 'Refund completed', body: `The late payment for expired order ${orderId} has been refunded.` } });
  }, TX);
}

/** Read provider evidence outside locks; re-read local state inside the transaction before acting. */
export async function reconcileCheckout(deps: Deps, orderId: string, now = new Date()): Promise<void> {
  const prior = await deps.prisma.checkout.findUniqueOrThrow({ where: { orderId }, include: { order: true } });
  if (prior.state === 'REFUND_PENDING') { await finishLateRefunds(deps, orderId); return; }
  if (['PAID', 'REFUNDED'].includes(prior.state)) return;
  let evidence: CheckoutVerification | null = null;
  if (prior.attemptedAt && deps.paystack.verifyCheckout) {
    try { evidence = await deps.paystack.verifyCheckout(prior.reference); } catch { /* Unknown evidence retains the reservation. */ }
  }
  const recorded = await deps.prisma.$transaction(async (tx) => {
    await lockOrderLifecycle(tx, orderId);
    const checkout = await tx.checkout.findUniqueOrThrow({ where: { orderId }, include: { order: true } });
    if (checkout.order.status !== 'PENDING') return;
    const matching = evidence?.reference === checkout.reference && evidence.amountKobo === checkout.order.grossAmount;
    if (matching && evidence?.status === 'success') {
      return recordCheckoutCharge(tx, orderId, checkout.reference);
    }
    const neverDispatched = checkout.state === 'CREATED' && checkout.attemptedAt === null;
    const provenUnpaid = matching && (evidence?.status === 'abandoned' || evidence?.status === 'failed');
    if (checkout.state !== 'EXPIRED' && checkout.expiresAt <= now && (neverDispatched || provenUnpaid)) {
      await tx.checkout.update({ where: { orderId }, data: { state: 'EXPIRED', authorizationUrl: null, lastCheckedAt: now } });
      await expireUnpaidOrder(tx, orderId, now);
    } else if (checkout.state !== 'EXPIRED') {
      await tx.checkout.update({ where: { orderId }, data: {
        lastCheckedAt: now,
        // An unknown initialization result cannot be dispatched again. A saved
        // URL may still resume while its reservation is within the time window.
        ...(checkout.attemptedAt && (!matching || !checkout.authorizationUrl || checkout.expiresAt <= now) ? { state: 'REVIEW' as const } : {}),
      } });
    }
  }, TX);
  if (recorded === 'held') await notifyCheckoutHeld(deps.prisma, orderId, deps.realtime);
  if ((await deps.prisma.checkout.findUniqueOrThrow({ where: { orderId } })).state === 'REFUND_PENDING')
    await finishLateRefunds(deps, orderId);
}

/** Durable at-most-once initialization. Lost provider responses remain reviewable under the original reference. */
export async function resumeCheckout(deps: Deps, params: { orderId: string; clientUserId: string; email?: string }, duplicate = true): Promise<CheckoutResponse> {
  await ownerOrder(deps.prisma, params.orderId, params.clientUserId);
  await ensureCheckout(deps.prisma, params.orderId, params.email);
  const dispatch = await deps.prisma.$transaction(async (tx) => {
    await lockOrderLifecycle(tx, params.orderId);
    const checkout = await tx.checkout.findUniqueOrThrow({ where: { orderId: params.orderId }, include: { order: true } });
    if (!(await activeCheckoutOwner(tx, params.orderId))) throw new ApiError(403, 'FORBIDDEN', 'account is no longer active');
    if (checkout.state !== 'CREATED' || checkout.order.status !== 'PENDING' || checkout.expiresAt <= new Date()) return null;
    await tx.checkout.update({ where: { orderId: params.orderId }, data: { state: 'INITIALIZING', attemptedAt: new Date() } });
    return { reference: checkout.reference, email: checkout.email, amountKobo: checkout.order.grossAmount };
  }, TX);
  if (dispatch) {
    try {
      const result = await deps.paystack.initializeCharge(dispatch);
      if (result.reference !== dispatch.reference || new URL(result.authorizationUrl).protocol !== 'https:') throw new Error('Invalid checkout response');
      await deps.prisma.$transaction(async (tx) => {
        await lockOrderLifecycle(tx, params.orderId);
        // Erasure takes the user lock before scrubbing checkout PII. Never
        // resurrect an authorization URL after that scrub has committed.
        if (await activeCheckoutOwner(tx, params.orderId))
          await tx.checkout.updateMany({ where: { orderId: params.orderId, state: { in: ['INITIALIZING', 'REVIEW'] } }, data: { authorizationUrl: result.authorizationUrl, state: 'READY' } });
      }, TX);
    } catch {
      await deps.prisma.checkout.updateMany({ where: { orderId: params.orderId, state: 'INITIALIZING' }, data: { state: 'REVIEW' } });
    }
  } else {
    const current = await deps.prisma.checkout.findUniqueOrThrow({ where: { orderId: params.orderId } });
    // Reopening a saved URL does not itself claim a payment occurred. The
    // status endpoint/browser return and worker perform provider verification.
    if (!(current.state === 'READY' && current.expiresAt > new Date()) && current.state !== 'INITIALIZING')
      await reconcileCheckout(deps, params.orderId);
  }
  return checkoutSnapshot(deps.prisma, params.orderId, duplicate);
}

export async function getCheckout(deps: Deps, orderId: string, userId: string): Promise<CheckoutResponse> {
  await ownerOrder(deps.prisma, orderId, userId);
  await ensureCheckout(deps.prisma, orderId);
  await reconcileCheckout(deps, orderId);
  return checkoutSnapshot(deps.prisma, orderId);
}

/** Includes expired references: a late success must always reach refund recovery. */
export async function reconcileCheckouts(deps: Deps, now = new Date()): Promise<void> {
  let legacyAfter: string | undefined;
  for (;;) {
    const legacy = await deps.prisma.order.findMany({
      where: { status: 'PENDING', checkout: null, ...(legacyAfter ? { id: { gt: legacyAfter } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: 100,
    });
    for (const order of legacy) await ensureCheckout(deps.prisma, order.id);
    if (legacy.length < 100) break;
    legacyAfter = legacy[legacy.length - 1]!.id;
  }
  let after: string | undefined;
  for (;;) {
    const page = await deps.prisma.checkout.findMany({
      where: { state: { notIn: ['PAID', 'REFUNDED'] }, ...(after ? { orderId: { gt: after } } : {}) },
      orderBy: { orderId: 'asc' }, take: 100,
    });
    for (const checkout of page) {
      try { await reconcileCheckout(deps, checkout.orderId, now); }
      catch { console.error('[checkout] recovery deferred', checkout.orderId); }
    }
    if (page.length < 100) break;
    after = page[page.length - 1]!.orderId;
  }
}
