import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { withdrawSchema } from '@hq/shared';
import { prisma } from '@hq/database';
import { ApiError } from '../../../app.js';
import { requireIdempotencyKey } from './middleware.js';
import { requireAuth, type AuthedRequest } from '../../auth/middleware.js';
import {
  initChargeForOrder,
  createBankAccountForUsher,
  initWithdrawal,
  type Deps,
} from '../service.js';

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req, res).catch(next);
  };

const bankAccountSchema = z.object({
  bankCode: z.string().min(3),
  accountNumber: z.string().regex(/^\d{10}$/),
  accountName: z.string().min(2),
});

async function usherWalletFor(userId: string): Promise<{ usherId: string; walletId: string }> {
  const usher = await prisma.usher.findFirst({
    where: { userId },
    include: { wallet: true },
  });
  if (!usher?.wallet) throw new ApiError(403, 'NOT_AN_USHER', 'no usher wallet for this user');
  return { usherId: usher.id, walletId: usher.wallet.id };
}

/** Money-mutating routes (TRD §24). Uses the dev auth shim until Phase 3. */
export function paymentsRouter(deps: Deps): Router {
  const r = Router();
  r.use(requireAuth);

  // ★ initialize the Paystack charge for an order (HOLD happens on webhook).
  r.post(
    '/orders/:orderId/charge',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const out = await initChargeForOrder(deps, { orderId: String(req.params.orderId), email });
      res.status(201).json(out);
    }),
  );

  // register a bank account as a transfer recipient
  r.post(
    '/bank-accounts',
    wrap(async (req, res) => {
      const { usherId } = await usherWalletFor((req as AuthedRequest).auth.userId);
      const body = bankAccountSchema.parse(req.body);
      const out = await createBankAccountForUsher(deps, { usherId, ...body });
      res.status(201).json(out);
    }),
  );

  // ★ withdraw available wallet balance to a bank account
  r.post(
    '/withdrawals',
    requireIdempotencyKey,
    wrap(async (req, res) => {
      const { walletId } = await usherWalletFor((req as AuthedRequest).auth.userId);
      const body = withdrawSchema.parse(req.body);
      const out = await initWithdrawal(deps, {
        idempotencyKey: (req as AuthedRequest).idempotencyKey ?? '',
        walletId,
        bankAccountId: body.bankAccountId,
        amountKobo: body.amountKobo,
      });
      res.status(out.duplicate ? 200 : 201).json(out);
    }),
  );

  return r;
}
