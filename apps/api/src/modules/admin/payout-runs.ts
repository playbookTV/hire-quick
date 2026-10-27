/**
 * Admin weekly payout runs (decisions record 2026-10-23). One admin submits the
 * reviewed lines and a different admin approves them. Approval creates one
 * withdrawal per line and starts the transfers in the background. While
 * Paystack's transfer OTP is on, an admin enters the owner's code per line.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@hq/database';
import { payoutRunTotal, type PayoutSkip } from '@hq/shared';
import { ApiError } from '../../app.js';
import type { AuthedRequest } from '../auth/middleware.js';
import { logger } from '../../logger.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import type { PaystackPort } from '../payments/port/paystack-port.js';
import {
  approvePayoutRun,
  buildPayoutRun,
  cancelPayoutRun,
  dispatchPayoutRun,
  executePayoutRun,
  payoutExclusionSchema,
  payoutRunLines,
  payoutSkipSchema,
  rejectPayoutRun,
  resendPayoutOtp,
  submitPayoutOtp,
  submitPayoutRun,
} from '../payments/payout-runs.js';

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap =
  (h: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    h(req as AuthedRequest, res).catch(next);
  };

const hashBody = z.object({ linesHash: z.string().regex(/^[0-9a-f]{64}$/) });
const otpBody = z.object({ otp: z.string().regex(/^\d{4,8}$/) });

async function runView(runId: string) {
  const run = await prisma.payoutRun.findUnique({
    where: { id: runId },
    include: {
      submittedBy: { select: { email: true } },
      approvedBy: { select: { email: true } },
      withdrawals: {
        select: { id: true, walletId: true, amount: true, status: true, paystackTransferRef: true, updatedAt: true },
      },
    },
  });
  if (!run) throw new ApiError(404, 'NOT_FOUND', 'Payout run not found.');
  const lines = payoutRunLines(run);
  const excluded = z.array(payoutExclusionSchema).catch([]).parse(run.excluded);
  const skipped: PayoutSkip[] = z.array(payoutSkipSchema).catch([]).parse(run.skipped ?? []);
  const usherIds = [...new Set([...lines, ...excluded].map((l) => l.usherId))];
  const [ushers, banks] = await Promise.all([
    prisma.usher.findMany({ where: { id: { in: usherIds } }, select: { id: true, displayName: true } }),
    prisma.bankAccount.findMany({
      where: { id: { in: lines.map((l) => l.bankAccountId) } },
      select: { id: true, bankCode: true, accountName: true, accountNumber: true },
    }),
  ]);
  const nameOf = new Map(ushers.map((u) => [u.id, u.displayName?.trim() || 'Unnamed usher']));
  const bankOf = new Map(banks.map((b) => [b.id, b]));
  const withdrawalOf = new Map(run.withdrawals.map((w) => [w.walletId, w]));
  const skipOf = new Map(skipped.map((s) => [s.walletId, s.reason]));
  const viewLines = lines.map((line) => {
    const bank = bankOf.get(line.bankAccountId);
    const w = withdrawalOf.get(line.walletId);
    return {
      usherId: line.usherId,
      usherName: nameOf.get(line.usherId) ?? 'Unnamed usher',
      amountKobo: line.amountKobo,
      flags: line.flags,
      bank: bank
        ? { bankCode: bank.bankCode, accountName: bank.accountName, last4: bank.accountNumber.slice(-4) }
        : null,
      withdrawal: w
        ? { id: w.id, status: w.status, amountKobo: w.amount, reference: w.paystackTransferRef, updatedAt: w.updatedAt }
        : null,
      skipReason: skipOf.get(line.walletId) ?? null,
    };
  });
  const count = (status: string) => run.withdrawals.filter((w) => w.status === status).length;
  return {
    id: run.id,
    periodKey: run.periodKey,
    status: run.status,
    builtAt: run.builtAt,
    linesHash: run.linesHash,
    totalKobo: payoutRunTotal(lines),
    submittedBy: run.submittedBy?.email ?? null,
    submittedById: run.submittedById,
    submittedAt: run.submittedAt,
    approvedBy: run.approvedBy?.email ?? null,
    approvedAt: run.approvedAt,
    executedAt: run.executedAt,
    lines: viewLines,
    excluded: excluded.map((e) => ({ ...e, usherName: nameOf.get(e.usherId) ?? 'Unnamed usher' })),
    summary: {
      paid: count('PAID'),
      processing: count('PROCESSING'),
      failed: count('FAILED'),
      notSent: skipped.length,
    },
  };
}

export function payoutRunsRouter(deps: {
  paystack?: PaystackPort | undefined;
  realtime: RealtimeGateway;
}): Router {
  const r = Router();
  const requirePaystack = (): PaystackPort => {
    if (!deps.paystack)
      throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'payments are not configured');
    return deps.paystack;
  };
  const dispatchInBackground = (paystack: PaystackPort, runId: string) => {
    // Lines left PENDING by a failure here are retried by the resumeOps job.
    void dispatchPayoutRun({ prisma, paystack }, runId)
      .then((counts) => {
        logger.info({ runId, ...counts }, 'payout run dispatched');
        deps.realtime.emitToAdmins('payout:run_dispatched', { runId, ...counts });
      })
      .catch(() => logger.error({ code: 'PAYOUT_DISPATCH_ERROR', runId }, 'payout run dispatch stopped'));
  };

  r.get(
    '/payout-runs',
    wrap(async (_req, res) => {
      const runs = await prisma.payoutRun.findMany({ orderBy: { periodKey: 'desc' }, take: 20 });
      res.json(
        runs.map((run) => {
          const lines = payoutRunLines(run);
          return {
            id: run.id,
            periodKey: run.periodKey,
            status: run.status,
            builtAt: run.builtAt,
            lineCount: lines.length,
            totalKobo: payoutRunTotal(lines),
            submittedAt: run.submittedAt,
            approvedAt: run.approvedAt,
            executedAt: run.executedAt,
          };
        }),
      );
    }),
  );

  r.get(
    '/payout-runs/:id',
    wrap(async (req, res) => {
      res.json(await runView(z.string().uuid().parse(req.params.id)));
    }),
  );

  // Build today's run, or refresh it while it is still a draft.
  r.post(
    '/payout-runs/build',
    wrap(async (req, res) => {
      const run = await buildPayoutRun(prisma, { actorId: req.auth.userId });
      res.status(201).json(await runView(run.id));
    }),
  );

  r.post(
    '/payout-runs/:id/submit',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { linesHash } = hashBody.parse(req.body);
      await submitPayoutRun(prisma, req.auth.userId, id, linesHash);
      deps.realtime.emitToAdmins('payout:run_submitted', { runId: id });
      res.json(await runView(id));
    }),
  );

  r.post(
    '/payout-runs/:id/reject',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      await rejectPayoutRun(prisma, req.auth.userId, id);
      res.json(await runView(id));
    }),
  );

  r.post(
    '/payout-runs/:id/cancel',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      await cancelPayoutRun(prisma, req.auth.userId, id);
      res.json(await runView(id));
    }),
  );

  // A different admin approves; withdrawals are created now, transfers start in the background.
  r.post(
    '/payout-runs/:id/approve',
    wrap(async (req, res) => {
      const paystack = requirePaystack();
      const id = z.string().uuid().parse(req.params.id);
      const { linesHash } = hashBody.parse(req.body);
      await approvePayoutRun(prisma, req.auth.userId, id, linesHash);
      await executePayoutRun(prisma, id);
      dispatchInBackground(paystack, id);
      deps.realtime.emitToAdmins('payout:run_approved', { runId: id });
      res.json(await runView(id));
    }),
  );

  // Start any line whose transfer has not reached Paystack yet.
  r.post(
    '/payout-runs/:id/dispatch',
    wrap(async (req, res) => {
      const paystack = requirePaystack();
      const id = z.string().uuid().parse(req.params.id);
      const run = await prisma.payoutRun.findUnique({ where: { id }, select: { status: true } });
      if (!run) throw new ApiError(404, 'NOT_FOUND', 'Payout run not found.');
      if (run.status === 'APPROVED') await executePayoutRun(prisma, id);
      else if (run.status !== 'EXECUTED')
        throw new ApiError(409, 'NOT_APPROVED', 'This payout run has not been approved.');
      dispatchInBackground(paystack, id);
      res.status(202).json(await runView(id));
    }),
  );

  r.post(
    '/payout-runs/:id/lines/:withdrawalId/otp',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const withdrawalId = z.string().uuid().parse(req.params.withdrawalId);
      const { otp } = otpBody.parse(req.body);
      const result = await submitPayoutOtp(
        { prisma, paystack: requirePaystack() },
        req.auth.userId,
        id,
        withdrawalId,
        otp,
      );
      res.json({ providerStatus: result.status, run: await runView(id) });
    }),
  );

  r.post(
    '/payout-runs/:id/lines/:withdrawalId/resend-otp',
    wrap(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const withdrawalId = z.string().uuid().parse(req.params.withdrawalId);
      await resendPayoutOtp({ prisma, paystack: requirePaystack() }, req.auth.userId, id, withdrawalId);
      res.json({ ok: true });
    }),
  );

  return r;
}
