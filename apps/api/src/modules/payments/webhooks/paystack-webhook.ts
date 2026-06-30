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
import type { PaystackPort } from '../port/paystack-port.js';
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
  paystack?: PaystackPort,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { paystackChargeRef: ref } });
  if (!order) return; // not one of ours — ack and ignore
  // Don't trust the webhook body — re-verify the charge server-side (status +
  // exact amount) before moving money (payment-integration: always verify).
  if (paystack) {
    const verified = await paystack.verifyChargeKobo(ref);
    if (verified.status !== 'success' || verified.amountKobo !== order.grossAmount) {
      await safeAudit({
        actorId: null,
        action: 'payment.charge.mismatch',
        target: order.id,
        metadata: { ref, expected: order.grossAmount, got: verified.amountKobo, status: verified.status },
      });
      return; // ack 200 so Paystack stops retrying a tampered/under-paid event; no HOLD
    }
  }
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

/**
 * Find the withdrawal a transfer event refers to. Primary lookup is by the
 * stored `paystackTransferRef`; the reference is deterministic (`wd_<id>`), so we
 * fall back to the id when the column write was lost mid-flight — otherwise such
 * a withdrawal would be invisible to its own webhooks and stick in PROCESSING.
 */
async function findWithdrawalByTransferRef(prisma: PrismaClient, ref: string) {
  const include = { wallet: { include: { usher: true } } };
  const byRef = await prisma.withdrawal.findFirst({ where: { paystackTransferRef: ref }, include });
  if (byRef) return byRef;
  const id = /^wd_(.+)$/.exec(ref)?.[1];
  if (!id) return null;
  return prisma.withdrawal.findUnique({ where: { id }, include });
}

async function handleTransferSuccess(
  prisma: PrismaClient,
  key: string,
  ref: string,
  realtime: RealtimeGateway,
): Promise<void> {
  const w = await findWithdrawalByTransferRef(prisma, ref);
  if (!w) return;
  // completeWithdrawal locks the row and no-ops if already terminal, so a
  // duplicate success or one racing a failure never double-settles.
  const done = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => completeWithdrawal(tx, w.id, ref));
  if (done.duplicate || done.result === false) {
    if (done.result === false) {
      await safeAudit({ actorId: null, action: 'withdrawal.complete.ignored', target: w.id, metadata: { ref } });
    }
    return;
  }
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
  const w = await findWithdrawalByTransferRef(prisma, ref);
  if (!w) return;
  // failWithdrawal locks the row, re-credits the wallet at most once, and no-ops
  // if already FAILED — so racing/duplicate failed+reversed events can't apply
  // multiple reversals or restore funds on an already-settled withdrawal.
  const failed = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => failWithdrawal(tx, w.id));
  if (failed.duplicate || failed.result === false) return;
  await safeAudit({ actorId: null, action: 'withdrawal.failed', target: w.id, metadata: { ref, event } });
  realtime.emitToUser(w.wallet.usher.userId, RT.WITHDRAWAL_FAILED, withdrawalEvent(w.id, 'FAILED', w.amount));
}

/** Dispatch a verified event into the ledger. Idempotency is keyed per event. */
export async function dispatchPaystackEvent(
  prisma: PrismaClient,
  evt: PaystackEvent,
  realtime: RealtimeGateway = noopGateway,
  paystack?: PaystackPort,
): Promise<void> {
  const ref = evt.data.reference ?? String(evt.data.id ?? '');
  const key = `${evt.event}:${ref}`;

  switch (evt.event) {
    case 'charge.success':
      return handleChargeSuccess(prisma, key, ref, realtime, paystack);
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
  paystack?: PaystackPort;
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
    dispatchPaystackEvent(deps.prisma, evt, deps.realtime ?? noopGateway, deps.paystack).then(
      () => res.status(200).json({ received: true }),
      (err: unknown) => {
        // 500 → Paystack retries with backoff (nothing dropped silently). The
        // detail is logged, not leaked in the response body.
        console.error('[webhook] handler error', err);
        res.status(500).json({ error: { code: 'HANDLER_ERROR', message: 'handler error' } });
      },
    );
  });

  return router;
}
