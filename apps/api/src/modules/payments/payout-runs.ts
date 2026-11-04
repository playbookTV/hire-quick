/**
 * Weekly payout runs (decisions record 2026-10-23). A run snapshots every
 * payable wallet balance. One admin submits it and a different admin approves
 * exactly that snapshot. Each line then becomes an ordinary withdrawal: wallet
 * DEBIT, durable WITHDRAWAL_TRANSFER operation, webhook settlement and REVERSAL
 * on failure. No new ledger entry types, so reconciliation is unchanged.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type Prisma, type PrismaClient, type PayoutRun } from '@hq/database';
import {
  IllegalTransition,
  PAYOUT_ACCOUNT_REVIEW_DAYS,
  PAYOUT_EXCLUSION_REASONS,
  PAYOUT_LINE_FLAGS,
  PAYOUT_MIN_KOBO,
  PAYOUT_SKIP_REASONS,
  assertPayoutRunTransition,
  lagosDateKey,
  payoutRunTotal,
  type PayoutExclusion,
  type PayoutLine,
  type PayoutLineFlag,
  type PayoutRunStatus,
  type PayoutSkip,
  type PayoutSkipReason,
} from '@hq/shared';
import { ApiError } from '../../app.js';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { writeAudit } from '../audit.js';
import { LedgerError, requestWithdrawal } from './ledger/ledger.js';
import { TransferOtpNotRequired, TransferOtpRejected } from './port/paystack-port.js';
import { driveTransfer, type Deps } from './service.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
const DAY_MS = 86_400_000;
// Serializes building, submitting, approving and executing runs.
const RUN_LOCK = 74011002;

const lineSchema = z.object({
  usherId: z.string().uuid(),
  walletId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  recipientCode: z.string().min(1),
  amountKobo: z.number().int().positive().safe(),
  flags: z.array(z.enum(PAYOUT_LINE_FLAGS)),
});
const exclusionSchema = z.object({
  usherId: z.string().uuid(),
  balanceKobo: z.number().int().nonnegative(),
  reason: z.enum(PAYOUT_EXCLUSION_REASONS),
});
const skipSchema = z.object({
  usherId: z.string().uuid(),
  walletId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  reason: z.enum(PAYOUT_SKIP_REASONS),
});

function runLines(run: Pick<PayoutRun, 'lines'>): PayoutLine[] {
  const parsed = z.array(lineSchema).safeParse(run.lines);
  if (!parsed.success)
    throw new ApiError(409, 'RUN_INTEGRITY', 'payout run lines are unreadable; operator review required');
  return parsed.data;
}

/** JSONB reorders object keys, so hash a fixed tuple per line. */
export function hashPayoutLines(lines: readonly PayoutLine[]): string {
  const canonical = lines.map((l) => [
    l.usherId,
    l.walletId,
    l.bankAccountId,
    l.recipientCode,
    l.amountKobo,
    [...l.flags].sort(),
  ]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function toStatus(status: PayoutRunStatus, to: PayoutRunStatus): void {
  try {
    assertPayoutRunTransition(status, to);
  } catch (error) {
    if (error instanceof IllegalTransition)
      throw new ApiError(409, 'RUN_STATE', `This payout run is ${status.toLowerCase().replace('_', ' ')}.`);
    throw error;
  }
}

async function lockedRun(tx: Prisma.TransactionClient, runId: string): Promise<PayoutRun> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${RUN_LOCK})::text`;
  const run = await tx.payoutRun.findUnique({ where: { id: runId } });
  if (!run) throw new ApiError(404, 'NOT_FOUND', 'Payout run not found.');
  return run;
}

/** Every wallet with money in it, split into payable lines and exclusions with reasons. */
export async function payableLines(
  db: Prisma.TransactionClient | PrismaClient,
  now: Date,
): Promise<{ lines: PayoutLine[]; excluded: PayoutExclusion[] }> {
  const wallets = await db.wallet.findMany({
    where: { availableBalance: { gt: 0 } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      availableBalance: true,
      withdrawals: { where: { status: 'PAID' }, select: { id: true }, take: 1 },
      usher: {
        select: {
          id: true,
          payoutAccountSetAt: true,
          user: { select: { status: true } },
          payoutBankAccount: {
            select: { id: true, verified: true, bvnVerified: true, paystackRecipientCode: true },
          },
        },
      },
    },
  });
  const reviewSince = now.getTime() - PAYOUT_ACCOUNT_REVIEW_DAYS * DAY_MS;
  const lines: PayoutLine[] = [];
  const excluded: PayoutExclusion[] = [];
  for (const wallet of wallets) {
    const { usher } = wallet;
    const account = usher.payoutBankAccount;
    const exclude = (reason: PayoutExclusion['reason']) =>
      excluded.push({ usherId: usher.id, balanceKobo: wallet.availableBalance, reason });
    if (wallet.availableBalance < PAYOUT_MIN_KOBO) exclude('BELOW_MINIMUM');
    else if (usher.user.status === 'SUSPENDED') exclude('USER_SUSPENDED');
    else if (usher.user.status === 'ANONYMIZED') exclude('USER_CLOSED');
    else if (!account) exclude('NO_PAYOUT_ACCOUNT');
    else if (!account.verified) exclude('ACCOUNT_NOT_VERIFIED');
    else if (env.WITHDRAWAL_REQUIRE_BVN && !account.bvnVerified) exclude('ACCOUNT_NOT_BVN_VERIFIED');
    else if (!account.paystackRecipientCode) exclude('NO_TRANSFER_RECIPIENT');
    else {
      const flags: PayoutLineFlag[] = [];
      if (!usher.payoutAccountSetAt || usher.payoutAccountSetAt.getTime() > reviewSince)
        flags.push('NEW_PAYOUT_ACCOUNT');
      if (!wallet.withdrawals.length) flags.push('FIRST_PAYOUT');
      lines.push({
        usherId: usher.id,
        walletId: wallet.id,
        bankAccountId: account.id,
        recipientCode: account.paystackRecipientCode,
        amountKobo: wallet.availableBalance,
        flags,
      });
    }
  }
  return { lines, excluded };
}

/**
 * Build (or refresh) the run for the Lagos date of `now`. A run past DRAFT is
 * returned unchanged, so the scheduled job is idempotent. Older drafts are
 * superseded; an older run still awaiting approval or execution blocks a new one.
 */
export async function buildPayoutRun(
  prisma: PrismaClient,
  opts: { now?: Date; actorId?: string | null } = {},
): Promise<PayoutRun> {
  const now = opts.now ?? new Date();
  const periodKey = lagosDateKey(now);
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${RUN_LOCK})::text`;
    const existing = await tx.payoutRun.findUnique({ where: { periodKey } });
    if (existing && existing.status !== 'DRAFT') return { run: existing, action: null };
    const blocking = await tx.payoutRun.findFirst({
      where: { periodKey: { not: periodKey }, status: { in: ['AWAITING_APPROVAL', 'APPROVED'] } },
    });
    if (blocking)
      throw new ApiError(
        409,
        'RUN_IN_PROGRESS',
        `Finish or reject the payout run for ${blocking.periodKey} before building a new one.`,
      );
    // DRAFT → CANCELLED is a legal transition; a newer snapshot replaces the old draft.
    const superseded = await tx.payoutRun.updateMany({
      where: { periodKey: { not: periodKey }, status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
    const { lines, excluded } = await payableLines(tx, now);
    const data = {
      builtAt: now,
      lines: lines as unknown as Prisma.InputJsonValue,
      excluded: excluded as unknown as Prisma.InputJsonValue,
      linesHash: hashPayoutLines(lines),
    };
    const run = existing
      ? await tx.payoutRun.update({ where: { id: existing.id }, data })
      : await tx.payoutRun.create({ data: { periodKey, ...data } });
    return {
      run,
      action: existing ? 'payout.run.refresh' : 'payout.run.build',
      metadata: {
        periodKey,
        lines: lines.length,
        totalKobo: payoutRunTotal(lines),
        excluded: excluded.length,
        supersededDrafts: superseded.count,
      },
    };
  }, TX);
  if (outcome.action)
    await writeAudit({
      actorId: opts.actorId ?? null,
      action: outcome.action,
      target: outcome.run.id,
      metadata: outcome.metadata,
    });
  return outcome.run;
}

function assertHash(run: PayoutRun, linesHash: string): void {
  if (run.linesHash !== linesHash || hashPayoutLines(runLines(run)) !== run.linesHash)
    throw new ApiError(
      409,
      'RUN_CHANGED',
      'The payout list changed since you opened it. Review it again.',
    );
}

/** The maker submits exactly the lines they reviewed. */
export async function submitPayoutRun(
  prisma: PrismaClient,
  adminId: string,
  runId: string,
  linesHash: string,
): Promise<PayoutRun> {
  const run = await prisma.$transaction(async (tx) => {
    const run = await lockedRun(tx, runId);
    toStatus(run.status, 'AWAITING_APPROVAL');
    assertHash(run, linesHash);
    if (!runLines(run).length)
      throw new ApiError(409, 'EMPTY_RUN', 'Nobody is due a payout in this run.');
    return tx.payoutRun.update({
      where: { id: runId },
      data: { status: 'AWAITING_APPROVAL', submittedById: adminId, submittedAt: new Date() },
    });
  }, TX);
  const lines = runLines(run);
  await writeAudit({
    actorId: adminId,
    action: 'payout.run.submit',
    target: runId,
    metadata: { lines: lines.length, totalKobo: payoutRunTotal(lines), linesHash },
  });
  return run;
}

/** Send a submitted run back to DRAFT so it can be refreshed and resubmitted. */
export async function rejectPayoutRun(
  prisma: PrismaClient,
  adminId: string,
  runId: string,
): Promise<PayoutRun> {
  const run = await prisma.$transaction(async (tx) => {
    const run = await lockedRun(tx, runId);
    toStatus(run.status, 'DRAFT');
    return tx.payoutRun.update({
      where: { id: runId },
      data: { status: 'DRAFT', submittedById: null, submittedAt: null },
    });
  }, TX);
  await writeAudit({ actorId: adminId, action: 'payout.run.reject', target: runId });
  return run;
}

/** Skip this payday entirely; balances roll over to the next run. */
export async function cancelPayoutRun(
  prisma: PrismaClient,
  adminId: string,
  runId: string,
): Promise<PayoutRun> {
  const run = await prisma.$transaction(async (tx) => {
    const run = await lockedRun(tx, runId);
    toStatus(run.status, 'CANCELLED');
    return tx.payoutRun.update({ where: { id: runId }, data: { status: 'CANCELLED' } });
  }, TX);
  await writeAudit({ actorId: adminId, action: 'payout.run.cancel', target: runId });
  return run;
}

/** A different admin approves the submitted snapshot. Execution follows separately. */
export async function approvePayoutRun(
  prisma: PrismaClient,
  adminId: string,
  runId: string,
  linesHash: string,
): Promise<PayoutRun> {
  const run = await prisma.$transaction(async (tx) => {
    const run = await lockedRun(tx, runId);
    toStatus(run.status, 'APPROVED');
    if (!run.submittedById || run.submittedById === adminId)
      throw new ApiError(403, 'SAME_ADMIN', 'A different admin must approve this payout run.');
    assertHash(run, linesHash);
    return tx.payoutRun.update({
      where: { id: runId },
      data: { status: 'APPROVED', approvedById: adminId, approvedAt: new Date() },
    });
  }, TX);
  const lines = runLines(run);
  await writeAudit({
    actorId: adminId,
    action: 'payout.run.approve',
    target: runId,
    metadata: { lines: lines.length, totalKobo: payoutRunTotal(lines), linesHash },
  });
  return run;
}

type LineOutcome = 'created' | 'exists' | PayoutSkipReason;

/** Create one withdrawal per approved line. Safe to repeat: a wallet is paid at most once per run. */
async function executeLine(
  prisma: PrismaClient,
  runId: string,
  line: PayoutLine,
): Promise<LineOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${line.walletId}::uuid FOR UPDATE`;
    const existing = await tx.withdrawal.findUnique({
      where: { payoutRunId_walletId: { payoutRunId: runId, walletId: line.walletId } },
      select: { id: true },
    });
    if (existing) return 'exists';
    const usher = await tx.usher.findUnique({
      where: { id: line.usherId },
      select: { user: { select: { status: true } }, wallet: { select: { id: true } } },
    });
    if (!usher || usher.wallet?.id !== line.walletId) return 'ACCOUNT_CHANGED';
    if (usher.user.status === 'SUSPENDED') return 'USER_SUSPENDED';
    if (usher.user.status === 'ANONYMIZED') return 'USER_CLOSED';
    const bank = await tx.bankAccount.findUnique({ where: { id: line.bankAccountId } });
    if (
      !bank ||
      bank.usherId !== line.usherId ||
      !bank.verified ||
      bank.paystackRecipientCode !== line.recipientCode ||
      (env.WITHDRAWAL_REQUIRE_BVN && !bank.bvnVerified)
    )
      return 'ACCOUNT_CHANGED';
    let withdrawalId: string;
    try {
      withdrawalId = await requestWithdrawal(tx, line.walletId, line.bankAccountId, line.amountKobo, {
        payoutRunId: runId,
      });
    } catch (error) {
      // Thrown before any write, so the transaction is still usable.
      if (error instanceof LedgerError && error.code === 'INSUFFICIENT_FUNDS')
        return 'INSUFFICIENT_BALANCE';
      throw error;
    }
    const reference = `wd_${withdrawalId}`;
    await tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { paystackTransferRef: reference },
    });
    await tx.paymentOperation.create({
      data: {
        kind: 'WITHDRAWAL_TRANSFER',
        dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}`,
        payload: {
          withdrawalId,
          amountKobo: line.amountKobo,
          recipientCode: line.recipientCode,
          reference,
        },
      },
    });
    return 'created';
  }, TX);
}

/**
 * Turn an APPROVED run's lines into withdrawals, then mark it EXECUTED. Each
 * line commits separately so a large run stays inside transaction limits;
 * recovery repeats this until the run is EXECUTED.
 */
export async function executePayoutRun(
  prisma: PrismaClient,
  runId: string,
): Promise<{ created: number; skipped: PayoutSkip[] }> {
  const run = await prisma.payoutRun.findUnique({ where: { id: runId } });
  if (!run) throw new ApiError(404, 'NOT_FOUND', 'Payout run not found.');
  if (run.status === 'EXECUTED')
    return { created: 0, skipped: z.array(skipSchema).catch([]).parse(run.skipped) };
  if (run.status !== 'APPROVED')
    throw new ApiError(409, 'NOT_APPROVED', 'This payout run has not been approved.');
  const lines = runLines(run);
  if (hashPayoutLines(lines) !== run.linesHash)
    throw new ApiError(409, 'RUN_INTEGRITY', 'payout run lines do not match their approval; operator review required');
  let created = 0;
  const skipped: PayoutSkip[] = [];
  for (const line of lines) {
    const outcome = await executeLine(prisma, runId, line);
    if (outcome === 'created') created += 1;
    else if (outcome !== 'exists')
      skipped.push({
        usherId: line.usherId,
        walletId: line.walletId,
        amountKobo: line.amountKobo,
        reason: outcome,
      });
  }
  const executed = await prisma.$transaction(async (tx) => {
    const current = await lockedRun(tx, runId);
    if (current.status === 'EXECUTED') return false;
    toStatus(current.status, 'EXECUTED');
    await tx.payoutRun.update({
      where: { id: runId },
      data: {
        status: 'EXECUTED',
        executedAt: new Date(),
        skipped: skipped as unknown as Prisma.InputJsonValue,
      },
    });
    return true;
  }, TX);
  if (executed)
    await writeAudit({
      actorId: null,
      action: 'payout.run.executed',
      target: runId,
      metadata: { created, skipped: skipped.length },
    });
  return { created, skipped };
}

/** Start every not-yet-issued transfer in the run, one at a time. */
export async function dispatchPayoutRun(
  deps: Deps,
  runId: string,
): Promise<{ paid: number; failed: number; pending: number; errors: number }> {
  const withdrawals = await deps.prisma.withdrawal.findMany({
    where: { payoutRunId: runId, status: 'PROCESSING' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const counts = { paid: 0, failed: 0, pending: 0, errors: 0 };
  for (const w of withdrawals) {
    const op = await deps.prisma.paymentOperation.findUnique({
      where: { dedupeKey: `WITHDRAWAL_TRANSFER:${w.id}` },
    });
    if (op?.status !== 'PENDING') continue;
    try {
      const result = await driveTransfer(deps, op);
      if (result.status === 'RECORDED') counts.paid += 1;
      else if (result.status === 'FAILED') counts.failed += 1;
      else counts.pending += 1;
    } catch {
      // The durable operation stays PENDING; resumeOps retries the same reference.
      counts.errors += 1;
      logger.warn({ code: 'PAYOUT_LINE_DISPATCH_ERROR', withdrawalId: w.id }, 'payout line dispatch failed');
    }
  }
  return counts;
}

async function payoutLineForOtp(prisma: PrismaClient, runId: string, withdrawalId: string) {
  const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w || w.payoutRunId !== runId) throw new ApiError(404, 'NOT_FOUND', 'Payout not found.');
  if (w.status !== 'PROCESSING' || !w.paystackTransferRef)
    throw new ApiError(409, 'OTP_NOT_REQUIRED', 'This payout is no longer waiting for a code.');
  return { ...w, reference: w.paystackTransferRef };
}

function otpError(error: unknown): never {
  if (error instanceof TransferOtpRejected)
    throw new ApiError(422, 'OTP_REJECTED', 'Paystack did not accept that code. Check it, or send a new code.');
  if (error instanceof TransferOtpNotRequired)
    throw new ApiError(
      409,
      'OTP_NOT_REQUIRED',
      error.status === 'unknown'
        ? 'This transfer has not reached Paystack yet. Send the payouts again, then enter the code.'
        : 'This transfer is not waiting for a code.',
    );
  throw error;
}

/** Enter the account owner's OTP for one line. The webhook settles the withdrawal. */
export async function submitPayoutOtp(
  deps: Deps,
  adminId: string,
  runId: string,
  withdrawalId: string,
  otp: string,
): Promise<{ status: 'success' | 'failed' | 'pending' }> {
  if (!deps.paystack.finalizeTransfer)
    throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Transfer codes are not supported here.');
  const line = await payoutLineForOtp(deps.prisma, runId, withdrawalId);
  let result: { status: 'success' | 'failed' | 'pending' };
  try {
    result = await deps.paystack.finalizeTransfer({ reference: line.reference, otp });
  } catch (error) {
    await writeAudit({
      actorId: adminId,
      action: 'payout.otp.rejected',
      target: withdrawalId,
      metadata: { runId },
    });
    otpError(error);
  }
  await writeAudit({
    actorId: adminId,
    action: 'payout.otp.submit',
    target: withdrawalId,
    metadata: { runId, providerStatus: result.status },
  });
  return result;
}

export async function resendPayoutOtp(
  deps: Deps,
  adminId: string,
  runId: string,
  withdrawalId: string,
): Promise<void> {
  if (!deps.paystack.resendTransferOtp)
    throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Transfer codes are not supported here.');
  const line = await payoutLineForOtp(deps.prisma, runId, withdrawalId);
  try {
    await deps.paystack.resendTransferOtp(line.reference);
  } catch (error) {
    otpError(error);
  }
  await writeAudit({
    actorId: adminId,
    action: 'payout.otp.resend',
    target: withdrawalId,
    metadata: { runId },
  });
}

/** Resume runs that were approved but not fully executed or dispatched (crash recovery). */
export async function resumePayoutRuns(deps: Deps): Promise<number> {
  const runs = await deps.prisma.payoutRun.findMany({
    where: { status: 'APPROVED' },
    select: { id: true },
  });
  for (const run of runs) {
    await executePayoutRun(deps.prisma, run.id);
    await dispatchPayoutRun(deps, run.id);
  }
  return runs.length;
}

export { runLines as payoutRunLines, exclusionSchema as payoutExclusionSchema, skipSchema as payoutSkipSchema };
