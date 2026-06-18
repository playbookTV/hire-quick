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

/** Dispatch a verified event into the ledger. Idempotency is keyed per event. */
export async function dispatchPaystackEvent(prisma: PrismaClient, evt: PaystackEvent): Promise<void> {
  const ref = evt.data.reference ?? String(evt.data.id ?? '');
  const key = `${evt.event}:${ref}`;

  switch (evt.event) {
    case 'charge.success': {
      const order = await prisma.order.findFirst({ where: { paystackChargeRef: ref } });
      if (!order) return; // not one of ours — ack and ignore
      await runIdempotent(prisma, key, 'paystack_event_id', (tx) => holdOrder(tx, order.id, ref));
      return;
    }
    case 'transfer.success': {
      const w = await prisma.withdrawal.findFirst({ where: { paystackTransferRef: ref } });
      if (!w) return;
      await runIdempotent(prisma, key, 'paystack_event_id', (tx) => completeWithdrawal(tx, w.id, ref));
      return;
    }
    case 'transfer.failed':
    case 'transfer.reversed': {
      const w = await prisma.withdrawal.findFirst({ where: { paystackTransferRef: ref } });
      if (!w || w.status === 'FAILED') return;
      await runIdempotent(prisma, key, 'paystack_event_id', (tx) => failWithdrawal(tx, w.id));
      return;
    }
    default:
      // refund.processed and others: acknowledged; ledger already reflects the
      // refund we initiated. Extend per event as needed.
      return;
  }
}

export function paystackWebhookRouter(deps: { prisma: PrismaClient; secret: string }): Router {
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
    dispatchPaystackEvent(deps.prisma, evt).then(
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
