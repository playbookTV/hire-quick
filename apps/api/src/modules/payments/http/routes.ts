import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { withdrawSchema, resolveAccountSchema } from '@hq/shared';
import { prisma } from '@hq/database';
import { ApiError } from '../../../app.js';
import { requireIdempotencyKey } from './middleware.js';
import { requireAuth, type AuthedRequest } from '../../auth/middleware.js';
import { writeAudit } from '../../audit.js';
import { RT, withdrawalEvent } from '../../../realtime/events.js';
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

// Account name is resolved server-side (createBankAccountForUsher), never trusted from the client.
const bankAccountSchema = z.object({
  bankCode: z.string().min(3),
  accountNumber: z.string().regex(/^\d{10}$/),
});

let banksCache: { at: number; banks: Awaited<ReturnType<Deps['paystack']['listBanks']>> } | null = null;
const BANKS_TTL_MS = 24 * 60 * 60 * 1000;

async function usherWalletFor(
  userId: string,
): Promise<{ usherId: string; walletId: string; availableBalance: number }> {
  const usher = await prisma.usher.findFirst({
    where: { userId },
    include: { wallet: true },
  });
  if (!usher?.wallet) throw new ApiError(403, 'NOT_AN_USHER', 'no usher wallet for this user');
  return { usherId: usher.id, walletId: usher.wallet.id, availableBalance: usher.wallet.availableBalance };
}

type Activity = {
  id: string;
  type: 'credit' | 'debit' | 'pending';
  title: string;
  subtitle: string;
  amount: number; // signed kobo
  createdAt: Date;
};

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
      const orderId = String(req.params.orderId);
      const out = await initChargeForOrder(deps, { orderId, email });
      await writeAudit({ actorId: (req as AuthedRequest).auth.userId, action: 'payment.charge.init', target: orderId });
      res.status(201).json(out);
    }),
  );

  // wallet summary — available (withdrawable) + pending-in-escrow + lifetime earned
  r.get(
    '/wallet',
    wrap(async (req, res) => {
      const { usherId, walletId, availableBalance } = await usherWalletFor((req as AuthedRequest).auth.userId);
      const pending = await prisma.payment.aggregate({
        where: { escrowStatus: 'HELD', booking: { usherId } },
        _sum: { usherPayout: true },
      });
      const lifetime = await prisma.walletLedger.aggregate({
        where: { walletId, entryType: 'CREDIT' },
        _sum: { amount: true },
      });
      res.json({
        availableBalance,
        pendingEscrow: pending._sum.usherPayout ?? 0,
        lifetimeEarned: lifetime._sum.amount ?? 0,
      });
    }),
  );

  // wallet activity — wallet credits/debits merged with still-held escrow rows
  r.get(
    '/wallet/activity',
    wrap(async (req, res) => {
      const { usherId, walletId } = await usherWalletFor((req as AuthedRequest).auth.userId);
      const ledger = await prisma.walletLedger.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { booking: { include: { event: { select: { title: true } } } } },
      });
      const held = await prisma.payment.findMany({
        where: { escrowStatus: 'HELD', booking: { usherId } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { booking: { include: { event: { select: { title: true } } } } },
      });
      // Resolve bank last-4 for debit rows (WalletLedger has no withdrawal relation).
      const withdrawalIds = ledger.flatMap((l) => (l.withdrawalId ? [l.withdrawalId] : []));
      const withdrawals = withdrawalIds.length
        ? await prisma.withdrawal.findMany({
            where: { id: { in: withdrawalIds } },
            include: { bankAccount: { select: { accountNumber: true } } },
          })
        : [];
      const acctById = new Map(withdrawals.map((w) => [w.id, w.bankAccount.accountNumber]));
      const last4 = (acct?: string): string => (acct ? `••${acct.slice(-4)}` : 'bank');
      const fromLedger: Activity[] = ledger.map((l) => {
        if (l.entryType === 'DEBIT') {
          return {
            id: l.id,
            type: 'debit',
            title: 'Withdrawal',
            subtitle: last4(l.withdrawalId ? acctById.get(l.withdrawalId) : undefined),
            amount: l.amount,
            createdAt: l.createdAt,
          };
        }
        return {
          id: l.id,
          type: 'credit',
          title: 'Payout received',
          subtitle: l.booking?.event?.title ?? 'Wallet credit',
          amount: l.amount,
          createdAt: l.createdAt,
        };
      });
      const fromHeld: Activity[] = held.map((p) => ({
        id: p.id,
        type: 'pending',
        title: 'Escrow hold',
        subtitle: p.booking.event.title,
        amount: p.usherPayout,
        createdAt: p.createdAt,
      }));
      const all = [...fromLedger, ...fromHeld]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50);
      res.json(all);
    }),
  );

  // Nigerian banks for the withdraw picker (cached in-process; the list is static).
  r.get(
    '/banks',
    wrap(async (_req, res) => {
      if (!banksCache || Date.now() - banksCache.at > BANKS_TTL_MS) {
        banksCache = { at: Date.now(), banks: await deps.paystack.listBanks() };
      }
      res.json(banksCache.banks);
    }),
  );

  // resolve a NUBAN → account name (the "real bank app" confirm step before adding)
  r.get(
    '/resolve-account',
    wrap(async (req, res) => {
      const { bankCode, accountNumber } = resolveAccountSchema.parse(req.query);
      try {
        const out = await deps.paystack.resolveAccount({ bankCode, accountNumber });
        res.json(out);
      } catch {
        throw new ApiError(422, 'ACCOUNT_RESOLVE_FAILED', 'Could not verify this account. Check the number and bank.');
      }
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

  // list registered bank accounts (to populate the withdraw sheet)
  r.get(
    '/bank-accounts',
    wrap(async (req, res) => {
      const { usherId } = await usherWalletFor((req as AuthedRequest).auth.userId);
      res.json(
        await prisma.bankAccount.findMany({
          where: { usherId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, bankCode: true, accountNumber: true, accountName: true, verified: true },
        }),
      );
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
      if (!out.duplicate) {
        await writeAudit({
          actorId: (req as AuthedRequest).auth.userId,
          action: 'withdrawal.request',
          target: out.withdrawalId || walletId,
          metadata: { amountKobo: body.amountKobo, bankAccountId: body.bankAccountId },
        });
        deps.realtime?.emitToUser(
          (req as AuthedRequest).auth.userId,
          RT.WITHDRAWAL_REQUESTED,
          withdrawalEvent(out.withdrawalId, 'PROCESSING', body.amountKobo),
        );
      }
      res.status(out.duplicate ? 200 : 201).json(out);
    }),
  );

  return r;
}
