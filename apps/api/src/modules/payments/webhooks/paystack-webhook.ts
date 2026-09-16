/**
 * Paystack webhook pipeline (TRD §10, payment-integration skill: webhooks are
 * the source of truth). Steps: verify the HMAC-SHA512 signature over the RAW
 * body → dedupe charges by reference and lock transfer operations → ledger.
 * Returns 200 on success/duplicate, 401 on bad signature, 500 on handler error
 * (so Paystack retries with backoff).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { type PrismaClient } from '@hq/database';
import { runIdempotent } from '../ledger/idempotency.js';
import { recordCheckoutCharge, notifyCheckoutHeld } from '../checkout.js';
import { completeWithdrawal, failWithdrawal, commissionSweep, reverseCommissionSweep } from '../ledger/ledger.js';
import { driveRefund, type TransferPayload } from '../service.js';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
import { noopGateway, type RealtimeGateway } from '../../../realtime/gateway.js';
import type { PaystackPort } from '../port/paystack-port.js';
import { RT, withdrawalEvent } from '../../../realtime/events.js';
import { driveWithdrawalReversal, recordWithdrawalReversal } from '../withdrawal-reversal.js';

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

const paystackEventSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    id: z.union([z.number(), z.string()]).optional(),
    reference: z.string().optional(),
    status: z.string().optional(),
    amount: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
      .pipe(z.number().int().safe().nonnegative()).optional(),
    currency: z.string().optional(),
    merchant_note: z.string().nullable().optional(),
    transaction: z.union([
      z.number(), z.string(), z.object({ reference: z.string().optional() }).passthrough(),
    ]).nullable().optional(),
    transaction_reference: z.string().optional(),
  }).passthrough(),
});
type PaystackEvent = z.infer<typeof paystackEventSchema>;

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
  const result = await runIdempotent(prisma, key, 'paystack_event_id', (tx) => recordCheckoutCharge(tx, order.id, ref));
  if (result.duplicate || result.result !== 'held') return;
  await safeAudit({
    actorId: null,
    action: 'payment.charge.hold',
    target: order.id,
    metadata: { ref, grossAmount: order.grossAmount },
  });
  await notifyCheckoutHeld(prisma, order.id, realtime);
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
  const id = /^wd_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(ref)?.[1];
  if (!id) return null;
  return prisma.withdrawal.findUnique({ where: { id }, include });
}

/** The operation and its financial result share one commit with the runner. */
async function handleTransferTerminal(
  prisma: PrismaClient,
  ref: string,
  evt: PaystackEvent,
  realtime: RealtimeGateway,
): Promise<void> {
  const op = await prisma.paymentOperation.findFirst({
    where: {
      kind: { in: ['WITHDRAWAL_TRANSFER', 'COMMISSION_SWEEP'] },
      payload: { path: ['reference'], equals: ref },
    },
  });
  const w = await findWithdrawalByTransferRef(prisma, ref);
  if (!op && !w) return;
  const success = evt.event === 'transfer.success';
  if (w && !success) {
    const payload = op?.payload as unknown as TransferPayload | undefined;
    if ((evt.data.amount !== undefined && evt.data.amount !== w.amount) ||
        (evt.data.currency !== undefined && evt.data.currency !== 'NGN') ||
        (op && (op.kind !== 'WITHDRAWAL_TRANSFER' || payload?.withdrawalId !== w.id || payload.amountKobo !== w.amount)))
      throw new Error('Transfer event does not match the stored withdrawal');
    const intent = await recordWithdrawalReversal(prisma, w.id, ref);
    const result = await driveWithdrawalReversal(prisma, intent);
    if (result.result) {
      await safeAudit({ actorId: null, action: 'withdrawal.failed', target: w.id, metadata: { ref, event: evt.event } });
      realtime.emitToUser(w.wallet.usher.userId, RT.WITHDRAWAL_FAILED, withdrawalEvent(w.id, 'FAILED', w.amount));
    }
    return;
  }
  const applied = await prisma.$transaction(async (tx) => {
    let current = op;
    if (op) {
      await tx.$queryRaw`SELECT id FROM payment_operations WHERE id = ${op.id}::uuid FOR UPDATE`;
      current = await tx.paymentOperation.findUniqueOrThrow({ where: { id: op.id } });
    }
    const payload = current?.payload as unknown as TransferPayload | undefined;
    const amount = payload?.amountKobo ?? w!.amount;
    if ((evt.data.amount !== undefined && evt.data.amount !== amount) ||
        (evt.data.currency !== undefined && evt.data.currency !== 'NGN'))
      throw new Error('Transfer event does not match the stored payment');
    if (current?.kind === 'WITHDRAWAL_TRANSFER' &&
        (!w || payload?.withdrawalId !== w.id || payload.amountKobo !== w.amount))
      throw new Error('Transfer intent does not match the withdrawal');
    if (current?.status === 'FAILED') return false;
    let changed = false;
    if (w) {
      changed = success
        ? await completeWithdrawal(tx, w.id, ref)
        : await failWithdrawal(tx, w.id);
      // A legacy failure may have settled before the operation was repaired.
      const settled = await tx.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
      if (current) await tx.paymentOperation.update({
        where: { id: current.id },
        data: {
          status: settled.status === 'FAILED' ? 'FAILED' : 'RECORDED',
          providerRef: ref,
          lastError: settled.status === 'FAILED' ? 'Provider confirmed transfer failure or reversal' : null,
        },
      });
      return changed;
    }
    if (!current || current.kind !== 'COMMISSION_SWEEP') return false;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74011001)::text`;
    if (success) {
      if (current.status === 'RECORDED') return false;
      await commissionSweep(tx, amount);
    } else if (current.status === 'RECORDED') {
      await reverseCommissionSweep(tx, amount);
    }
    await tx.paymentOperation.update({
      where: { id: current.id },
      data: {
        status: success ? 'RECORDED' : 'FAILED',
        providerRef: ref,
        lastError: success ? null : 'Provider confirmed transfer failure or reversal',
      },
    });
    return true;
  }, { timeout: 30_000, maxWait: 30_000 });
  if (!applied) return;
  await safeAudit({
    actorId: null,
    action: w ? (success ? 'withdrawal.complete' : 'withdrawal.failed') : 'commission.transfer.settled',
    target: w?.id ?? op!.id,
    metadata: { ref, event: evt.event },
  });
  if (w) realtime.emitToUser(
    w.wallet.usher.userId,
    success ? RT.WITHDRAWAL_COMPLETED : RT.WITHDRAWAL_FAILED,
    withdrawalEvent(w.id, success ? 'PAID' : 'FAILED', w.amount),
  );
}

/** A callback only wakes read-only reconciliation; it never authorizes a POST. */
async function handleRefundEvent(
  prisma: PrismaClient,
  evt: PaystackEvent,
  paystack?: PaystackPort,
): Promise<void> {
  const note = evt.data.merchant_note;
  const transaction = evt.data.transaction;
  const chargeRef = evt.data.transaction_reference ??
    (typeof transaction === 'string' ? transaction :
      typeof transaction === 'object' && transaction ? transaction.reference : undefined);
  if (!note && !chargeRef) return;
  const operations = await prisma.paymentOperation.findMany({
    where: {
      kind: 'BOOKING_REFUND',
      // Do not steal attempt 1 from an intent committed just before a different
      // booking's callback. Only the request runner can initiate that refund.
      OR: [{ status: 'PENDING', attempts: { gt: 0 } }, { status: 'PROVIDER_OK' }],
      ...(note ? { dedupeKey: note } : { payload: { path: ['chargeReference'], equals: chargeRef! } }),
    },
  });
  if (!operations.length) return;
  if (!paystack) throw new Error('Refund reconciliation requires the payment provider');
  for (const operation of operations) {
    const result = await driveRefund({ prisma, paystack }, operation, true);
    // Preserve provider retries when the read side has not caught up with the
    // terminal event, or verification failed. Scheduled recovery also remains.
    if (result.status === 'PENDING' && ['refund.processed', 'refund.failed'].includes(evt.event))
      throw new Error('Terminal refund evidence is not yet available');
  }
}

/** Dispatch a verified event; repeated financial effects are guarded in the DB. */
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
      return handleTransferTerminal(prisma, ref, evt, realtime);
    case 'transfer.failed':
    case 'transfer.reversed':
      return handleTransferTerminal(prisma, ref, evt, realtime);
    case 'refund.processed':
    case 'refund.failed':
    case 'refund.pending':
    case 'refund.processing':
    case 'refund.needs-attention':
      return handleRefundEvent(prisma, evt, paystack);
    default:
      // Unhandled provider events do not mutate the ledger.
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
      evt = paystackEventSchema.parse(JSON.parse(raw.toString('utf8')));
    } catch {
      res.status(400).json({ error: { code: 'BAD_PAYLOAD', message: 'invalid event payload' } });
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
