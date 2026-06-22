/**
 * Paystack webhook pipeline (TRD §10, payment-integration skill: webhooks are
 * the source of truth). Steps: verify the HMAC-SHA512 signature over the RAW
 * body → dedupe by event id (idempotency_keys) → dispatch to the ledger.
 * Returns 200 on success/duplicate, 401 on bad signature, 500 on handler error
 * (so Paystack retries with backoff).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { type PrismaClient } from '@hq/database';
import { runIdempotent } from '../ledger/idempotency.js';
import { holdOrder, completeWithdrawal, failWithdrawal } from '../ledger/ledger.js';
import { notifyBookingConfirmed } from '../../notifications/service.js';
import { writeAudit } from '../../audit.js';
import { noopGateway, type RealtimeGateway } from '../../../realtime/gateway.js';
import { RT, bookingEvent, withdrawalEvent } from '../../../realtime/events.js';

/**
 * Audit is secondary to money safety: a failed audit write must never reject
 * webhook dispatch (which would 500 → Paystack retry → idempotent skip → lost
 * audit). Log and move on. The ledger remains the authoritative money record.
 */
async function safeAudit(entry: Parameters<typeof writeAudit>[0]): Promise<void> {
  try {
    await writeAudit(entry);
  } catch (err) {
    console.error('[audit] webhook audit failed', entry.action, err);
  }
}

export function verifyPaystackSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature ?? '', 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PaystackEvent {
  event: string;
  data: { id?: number | string; reference?: string; status?: string };
}

async function handleChargeSuccess(
  prisma: PrismaClient,
  key: string,
  ref: string,
  realtime: RealtimeGateway,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { paystackChargeRef: ref } });
  if (!order) return; // not one of ours — ack and ignore
  const result = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => holdOrder(tx, order.id, ref));
  if (result.duplicate) return;
  await safeAudit({
    actorId: null,
    action: 'payment.charge.hold',
    target: order.id,
    metadata: { ref, grossAmount: order.grossAmount },
  });
  const bookings = await prisma.booking.findMany({
    where: { orderId: order.id },
    include: { usher: true, event: { include: { client: true } } },
  });
  let clientUserId = '';
  for (const b of bookings) {
    notifyBookingConfirmed(b.usher.userId);
    clientUserId = b.event.client.userId;
    const payload = bookingEvent(b.id, 'CONFIRMED');
    realtime.emitToUser(b.usher.userId, RT.BOOKING_CONFIRMED, payload);
    realtime.emitToUser(clientUserId, RT.BOOKING_CONFIRMED, payload);
  }
  if (clientUserId) {
    realtime.emitToUser(clientUserId, RT.ORDER_PAID, { orderId: order.id, at: new Date().toISOString() });
  }
}

async function handleTransferSuccess(
  prisma: PrismaClient,
  key: string,
  ref: string,
  realtime: RealtimeGateway,
): Promise<void> {
  const w = await prisma.withdrawal.findFirst({
    where: { paystackTransferRef: ref },
    include: { wallet: { include: { usher: true } } },
  });
  if (!w) return;
  const done = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => completeWithdrawal(tx, w.id, ref));
  if (done.duplicate) return;
  await safeAudit({ actorId: null, action: 'withdrawal.complete', target: w.id, metadata: { ref, amount: w.amount } });
  realtime.emitToUser(w.wallet.usher.userId, RT.WITHDRAWAL_COMPLETED, withdrawalEvent(w.id, 'PAID', w.amount));
}

async function handleTransferFailed(
  prisma: PrismaClient,
  key: string,
  ref: string,
  event: string,
  realtime: RealtimeGateway,
): Promise<void> {
  const w = await prisma.withdrawal.findFirst({
    where: { paystackTransferRef: ref },
    include: { wallet: { include: { usher: true } } },
  });
  if (!w || w.status === 'FAILED') return;
  const failed = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => failWithdrawal(tx, w.id));
  if (failed.duplicate) return;
  await safeAudit({ actorId: null, action: 'withdrawal.failed', target: w.id, metadata: { ref, event } });
  realtime.emitToUser(w.wallet.usher.userId, RT.WITHDRAWAL_FAILED, withdrawalEvent(w.id, 'FAILED', w.amount));
}

/** Dispatch a verified event into the ledger. Idempotency is keyed per event. */
export async function dispatchPaystackEvent(
  prisma: PrismaClient,
  evt: PaystackEvent,
  realtime: RealtimeGateway = noopGateway,
): Promise<void> {
  const ref = evt.data.reference ?? String(evt.data.id ?? '');
  const key = `${evt.event}:${ref}`;

  switch (evt.event) {
    case 'charge.success':
      return handleChargeSuccess(prisma, key, ref, realtime);
    case 'transfer.success':
      return handleTransferSuccess(prisma, key, ref, realtime);
    case 'transfer.failed':
    case 'transfer.reversed':
      return handleTransferFailed(prisma, key, ref, evt.event, realtime);
    default:
      // refund.processed and others: acknowledged; ledger already reflects the
      // refund we initiated. Extend per event as needed.
      return;
  }
}

export function paystackWebhookRouter(deps: {
  prisma: PrismaClient;
  secret: string;
  realtime?: RealtimeGateway;
}): Router {
  const router = Router();

  // NOTE: must be mounted with express.raw so req.body is the raw Buffer.
  router.post('/', (req: Request, res: Response) => {
    const raw = req.body as Buffer;
    const signature = req.header('x-paystack-signature') ?? '';
    if (!Buffer.isBuffer(raw) || !verifyPaystackSignature(raw, signature, deps.secret)) {
      res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'invalid signature' } });
      return;
    }
    let evt: PaystackEvent;
    try {
      evt = JSON.parse(raw.toString('utf8')) as PaystackEvent;
    } catch {
      res.status(400).json({ error: { code: 'BAD_PAYLOAD', message: 'invalid json' } });
      return;
    }
    dispatchPaystackEvent(deps.prisma, evt, deps.realtime ?? noopGateway).then(
      () => res.status(200).json({ received: true }),
      (err: unknown) => {
        // 500 → Paystack retries with backoff (nothing dropped silently).
        const message = err instanceof Error ? err.message : 'handler error';
        res.status(500).json({ error: { code: 'HANDLER_ERROR', message } });
      },
    );
  });

  return router;
}
