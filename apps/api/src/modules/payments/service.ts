/**
 * Phase 2 payment services: orchestrate Paystack (test mode) with the ledger.
 * Order + booking *creation* from applications is Phase 4; these compose on top
 * of an existing PENDING order.
 */
import { type PrismaClient, type PaymentOperation } from '@hq/database';
import { MAX_INT32_KOBO, withdrawalResponseSchema, type WithdrawalResponse, type CheckoutResponse } from '@hq/shared';
import { ApiError } from '../../app.js';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { resumeCheckout } from './checkout.js';
import { runIdempotent } from './ledger/idempotency.js';
import { runOperation } from './ledger/operations.js';
import { lockBookingLifecycle } from '../events/staffing.js';
import {
  requestWithdrawal,
  completeWithdrawal,
  assertRefundable,
  failWithdrawal,
  commissionSweep,
  refundBooking,
  cancelBooking,
  markNoShow,
} from './ledger/ledger.js';
import type { PaystackPort } from './port/paystack-port.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';
import { driveWithdrawalReversal, isWithdrawalReversal, recordWithdrawalReversal } from './withdrawal-reversal.js';
import { claimTransferDispatch, ownsTransferDispatch, releaseTransferDispatch } from './transfer-dispatch.js';

const TX = { timeout: 30_000, maxWait: 30_000 };

export interface Deps {
  prisma: PrismaClient;
  paystack: PaystackPort;
  realtime?: RealtimeGateway;
}

export interface RefundPayload {
  bookingId: string;
  amountKobo: number;
  precursor: 'CANCEL' | 'NO_SHOW' | null;
  chargeReference: string | null;
  disputeResolution?: { disputeId: string; resolution: string; adminId: string };
}

/** Reserve and validate under the booking lock before the first provider call. */
export async function refundBookingToClient(
  deps: Deps,
  params: {
    bookingId: string;
    amountKobo: number;
    precursor?: 'CANCEL' | 'NO_SHOW' | undefined;
    disputeResolution?: RefundPayload['disputeResolution'];
  },
): Promise<{ refunded: boolean; status: 'PENDING' | 'RECORDED' | 'FAILED' }> {
  const op = await deps.prisma.$transaction(async (tx) => {
    await lockBookingLifecycle(tx, params.bookingId);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: params.bookingId },
      include: { order: true },
    });
    const existing = await tx.paymentOperation.findUnique({
      where: { dedupeKey: `BOOKING_REFUND:${params.bookingId}` },
    });
    if (existing) {
      const saved = existing.payload as unknown as RefundPayload;
      if (
        saved.amountKobo !== params.amountKobo ||
        (params.precursor !== undefined && saved.precursor !== params.precursor)
      ) {
        throw new ApiError(
          409,
          'REFUND_CONFLICT',
          'a different refund is already recorded for this booking',
        );
      }
      return existing;
    }
    if (booking.status === 'REFUNDED') return null;
    await assertRefundable(tx, params.bookingId, params.amountKobo, params.precursor);
    return tx.paymentOperation.create({
      data: {
        kind: 'BOOKING_REFUND',
        dedupeKey: `BOOKING_REFUND:${params.bookingId}`,
        payload: {
          bookingId: params.bookingId,
          amountKobo: params.amountKobo,
          precursor: params.precursor ?? null,
          chargeReference: booking.order?.paystackChargeRef ?? null,
          ...(params.disputeResolution ? { disputeResolution: params.disputeResolution } : {}),
        },
      },
    });
  }, TX);
  if (!op) return { refunded: false, status: 'RECORDED' };
  const result = await driveRefund(deps, op);
  return { refunded: result.status === 'RECORDED', status: result.status };
}

export async function driveRefund(deps: Deps, op: PaymentOperation, readOnly = false) {
  let payload = op.payload as unknown as RefundPayload;
  // Older runners could dispatch and roll back attempts. Treat legacy pending
  // refunds as already attempted; never blindly send them again on deployment.
  if (!('chargeReference' in payload)) {
    const legacy = op.payload as unknown as Omit<RefundPayload, 'chargeReference'>;
    const booking = await deps.prisma.booking.findUniqueOrThrow({
      where: { id: legacy.bookingId },
      include: { order: true },
    });
    payload = { ...legacy, chargeReference: booking.order?.paystackChargeRef ?? null };
    await deps.prisma.paymentOperation.updateMany({
      where: { id: op.id, status: 'PENDING', attempts: 0 },
      data: { attempts: 1 },
    });
  }
  const request = {
    chargeReference: payload.chargeReference ?? '',
    amountKobo: payload.amountKobo,
    reference: op.dedupeKey,
  };
  const check = async (first: boolean) => {
    if (payload.amountKobo === 0) return { status: 'success' as const };
    const result = await (first
      ? deps.paystack.refund(request)
      : deps.paystack.verifyRefund(request));
    return { status: result.status === 'processed' ? ('success' as const) : result.status };
  };
  return runOperation(
    deps.prisma,
    op,
    {
      provider: () => check(!readOnly),
      reconcile: () => check(false),
      onSuccess: async (tx) => {
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: payload.bookingId } });
        if (booking.status === 'REFUNDED') return false;
        if (payload.precursor === 'CANCEL') await cancelBooking(tx, payload.bookingId);
        else if (payload.precursor === 'NO_SHOW') await markNoShow(tx, payload.bookingId);
        await refundBooking(tx, payload.bookingId, payload.amountKobo);
        if (payload.disputeResolution) {
          const d = payload.disputeResolution;
          await tx.dispute.update({
            where: { id: d.disputeId },
            data: { status: 'RESOLVED', resolution: d.resolution, resolvedById: d.adminId },
          });
        }
        return true;
      },
    },
    TX,
  );
}

export interface TransferPayload {
  withdrawalId?: string;
  amountKobo: number;
  recipientCode: string;
  reference: string;
}

class PendingTransferReversal extends Error {
  constructor(readonly operation: PaymentOperation) {
    super('Transfer reversal must settle before success');
  }
}

/** Same protocol for synchronous requests and recovery. Reissue only the original reference. */
export async function driveTransfer(deps: Deps, op: PaymentOperation) {
  if (isWithdrawalReversal(op)) {
    const reversed = await driveWithdrawalReversal(deps.prisma, op);
    return { status: reversed.status, result: reversed.result ? (op.payload as unknown as TransferPayload).amountKobo : null };
  }
  let p = op.payload as unknown as TransferPayload;
  const knownReversal = async () => p.withdrawalId ? deps.prisma.paymentOperation.findUnique({
    where: { dedupeKey: `WITHDRAWAL_REVERSAL:${p.withdrawalId}` },
  }) : null;
  const reversal = await knownReversal();
  if (reversal) {
    const reversed = await driveWithdrawalReversal(deps.prisma, reversal);
    return { status: reversed.status, result: reversed.result ? p.amountKobo : null };
  }
  if (!Number.isSafeInteger(p.amountKobo) || p.amountKobo <= 0 || p.amountKobo > MAX_INT32_KOBO)
    throw new ApiError(409, 'AMOUNT_LIMIT', 'transfer amount cannot be recorded safely; operator review required');
  const claim = await claimTransferDispatch(deps.prisma, op.id);
  if (claim.state === 'busy') return { status: 'PENDING' as const, result: null };
  op = claim.op;
  p = op.payload as unknown as TransferPayload;
  const owner = claim.state === 'claimed' ? claim.owner : null;
  try {
    if (!Number.isSafeInteger(p.amountKobo) || p.amountKobo <= 0 || p.amountKobo > MAX_INT32_KOBO)
      throw new ApiError(409, 'AMOUNT_LIMIT', 'transfer amount cannot be recorded safely; operator review required');
    const persistFailure = async (status: string) => {
      if (status === 'failed' && p.withdrawalId)
        await recordWithdrawalReversal(deps.prisma, p.withdrawalId, p.reference);
    };
    const send = async () => {
      if (await knownReversal()) return { status: 'failed' as const, providerRef: p.reference };
      if (!owner || !await ownsTransferDispatch(deps.prisma, op.id, owner)) return { status: 'pending' as const };
      const verified = await deps.paystack.verifyTransfer(p.reference);
      if (await knownReversal()) return { status: 'failed' as const, providerRef: p.reference };
      if (verified.status !== 'unknown') {
        await persistFailure(verified.status);
        return { ...verified, providerRef: p.reference };
      }
      // A callback can record terminal failure while verification is in flight.
      if (await knownReversal()) return { status: 'failed' as const, providerRef: p.reference };
      if (!await ownsTransferDispatch(deps.prisma, op.id, owner)) return { status: 'pending' as const };
      const issued = await deps.paystack.transfer({
        amountKobo: p.amountKobo,
        recipientCode: p.recipientCode,
        reference: p.reference,
        reason: p.withdrawalId ? 'HireQuick payout' : 'HireQuick commission sweep',
      });
      if (await knownReversal()) return { status: 'failed' as const, providerRef: p.reference };
      await persistFailure(issued.status);
      return { status: issued.status, providerRef: p.reference };
    };
    return await runOperation(
      deps.prisma,
      op,
      {
        provider: send,
        reconcile: send,
        onSuccess: async (tx) => {
          if (p.withdrawalId) {
            const reversal = await tx.paymentOperation.findUnique({
              where: { dedupeKey: `WITHDRAWAL_REVERSAL:${p.withdrawalId}` },
            });
            if (reversal) throw new PendingTransferReversal(reversal);
            await completeWithdrawal(tx, p.withdrawalId, p.reference);
          }
          else {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(74011001)::text`;
            await commissionSweep(tx, p.amountKobo);
          }
          return p.amountKobo;
        },
        onFailure: async (tx) => {
          if (p.withdrawalId) {
            const reversal = await tx.paymentOperation.findUnique({
              where: { dedupeKey: `WITHDRAWAL_REVERSAL:${p.withdrawalId}` },
            });
            if (reversal) throw new PendingTransferReversal(reversal);
            await failWithdrawal(tx, p.withdrawalId);
          }
        },
      },
      TX,
    );
  } catch (error) {
    if (!(error instanceof PendingTransferReversal)) throw error;
    // The original transaction has rolled back: take reversal then original
    // locks in the normal order, and retain capacity-blocked retry evidence.
    const reversed = await driveWithdrawalReversal(deps.prisma, error.operation);
    return { status: reversed.status, result: reversed.result ? p.amountKobo : null };
  } finally {
    if (owner) {
      try { await releaseTransferDispatch(deps.prisma, op.id, owner); }
      catch {
        // An expired lease is reclaimable; cleanup must not obscure a committed
        // payment outcome or initiate compensation after provider success.
        logger.warn({ operationId: op.id }, 'Transfer dispatch lease cleanup failed; expiry will permit recovery');
      }
    }
  }
}

/** Initialize the Paystack charge for a PENDING order; HOLD happens on webhook. */
export async function initChargeForOrder(
  deps: Deps,
  params: { orderId: string; email: string; clientUserId: string },
): Promise<CheckoutResponse> {
  return resumeCheckout(deps, params);
}

/**
 * Register an usher bank account as a Paystack transfer recipient. The account
 * name is always re-resolved server-side so a registered recipient can never
 * carry a name the client spoofed.
 */
export async function createBankAccountForUsher(
  deps: Deps,
  params: { usherId: string; bankCode: string; accountNumber: string },
): Promise<{ id: string; accountName: string; recipientCode: string }> {
  const { accountName } = await deps.paystack.resolveAccount({
    bankCode: params.bankCode,
    accountNumber: params.accountNumber,
  });
  const { recipientCode } = await deps.paystack.createTransferRecipient({
    bankCode: params.bankCode,
    accountNumber: params.accountNumber,
    accountName,
  });
  const ba = await deps.prisma.bankAccount.create({
    data: {
      usherId: params.usherId,
      bankCode: params.bankCode,
      accountNumber: params.accountNumber,
      accountName,
      paystackRecipientCode: recipientCode,
      verified: true,
    },
  });
  return { id: ba.id, accountName, recipientCode };
}

/**
 * Withdraw available wallet balance to a bank account. Debits the wallet inside
 * an idempotent transaction, then fires the Paystack transfer; transfer.success
 * / transfer.failed webhooks finalize the status.
 */
export async function initWithdrawal(
  deps: Deps,
  params: {
    idempotencyKey: string;
    usherId: string;
    walletId: string;
    bankAccountId: string;
    amountKobo: number;
  },
): Promise<WithdrawalResponse> {
  const wallet = await deps.prisma.wallet.findUniqueOrThrow({ where: { id: params.walletId } });
  if (wallet.usherId !== params.usherId) {
    throw new ApiError(403, 'FORBIDDEN', 'wallet does not belong to you');
  }
  const bank = await deps.prisma.bankAccount.findUniqueOrThrow({
    where: { id: params.bankAccountId },
  });
  // The destination must belong to the withdrawing usher — otherwise a caller
  // could route their own payout to anyone else's registered bank account.
  if (bank.usherId !== params.usherId) {
    throw new ApiError(403, 'FORBIDDEN', 'bank account does not belong to you');
  }
  // Money-safety gate (§23 Q3): a payout may only leave to a verified destination
  // — the account name was resolved/matched server-side at registration. The live
  // BVN match is an additional, flag-gated requirement (off until that check is
  // wired against live Paystack); when on, the account must also be bvnVerified.
  if (!bank.verified) {
    throw new ApiError(403, 'UNVERIFIED_ACCOUNT', 'bank account is not verified for payouts');
  }
  if (env.WITHDRAWAL_REQUIRE_BVN && !bank.bvnVerified) {
    throw new ApiError(
      403,
      'UNVERIFIED_ACCOUNT',
      'bank account requires BVN verification before payouts',
    );
  }
  if (!bank.paystackRecipientCode) throw new Error('bank account has no transfer recipient');
  const recipientCode = bank.paystackRecipientCode;

  const { duplicate, result } = await runIdempotent(
    deps.prisma,
    params.idempotencyKey,
    'withdrawal',
    async (tx) => {
      const withdrawalId = await requestWithdrawal(
        tx,
        params.walletId,
        params.bankAccountId,
        params.amountKobo,
      );
      const reference = `wd_${withdrawalId}`;
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { paystackTransferRef: reference },
      });
      await tx.paymentOperation.create({
        data: {
          kind: 'WITHDRAWAL_TRANSFER',
          dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}`,
          payload: { withdrawalId, amountKobo: params.amountKobo, recipientCode, reference },
        },
      });
      return withdrawalId;
    },
    {
      callerId: params.usherId,
      requestFingerprint: JSON.stringify([params.walletId, params.bankAccountId, params.amountKobo]),
      legacyReplay: async (tx, withdrawalId) => {
        if (typeof withdrawalId !== 'string') {
          throw new ApiError(409, 'WITHDRAWAL_CONFLICT', 'withdrawal requires operator reconciliation');
        }
        const saved = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!saved) throw new ApiError(409, 'WITHDRAWAL_CONFLICT', 'withdrawal result is unavailable');
        if (saved.walletId !== params.walletId) return false;
        if (saved.bankAccountId !== params.bankAccountId || saved.amount !== params.amountKobo) {
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'this idempotency key was used for a different request');
        }
        return true;
      },
    },
  );
  if (!result) throw new ApiError(409, 'WITHDRAWAL_CONFLICT', 'withdrawal result is unavailable');
  // Check replay ownership before any operation is repaired or dispatched.
  const saved = await deps.prisma.withdrawal.findUniqueOrThrow({ where: { id: result } });
  if (saved.walletId !== params.walletId || saved.bankAccountId !== params.bankAccountId || saved.amount !== params.amountKobo) {
    throw new ApiError(409, 'WITHDRAWAL_CONFLICT', 'withdrawal does not match this request');
  }
  const op = await ensureWithdrawalOperation(deps, result);
  await driveTransfer(deps, op);
  // Provider callbacks may settle/reverse while dispatch returns. Read status
  // and balance under the same locks used by ledger finalization.
  return deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM withdrawals WHERE id = ${result}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${params.walletId}::uuid FOR UPDATE`;
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: result } });
    const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { id: params.walletId } });
    const outcome = withdrawalResponseSchema.safeParse({
      withdrawalId: withdrawal.id, duplicate, status: withdrawal.status,
      amountKobo: withdrawal.amount, bankAccountId: withdrawal.bankAccountId,
      availableBalance: currentWallet.availableBalance,
    });
    if (!outcome.success) {
      throw new ApiError(500, 'WITHDRAWAL_OUTCOME_UNAVAILABLE', 'withdrawal outcome is unavailable; retry the same request');
    }
    return outcome.data;
  }, TX);
}

/** Repair old debits without an operation using the persisted withdrawal, never retry request data. */
export async function ensureWithdrawalOperation(
  deps: Deps,
  withdrawalId: string,
): Promise<PaymentOperation> {
  return deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM withdrawals WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
    const existing = await tx.paymentOperation.findUnique({
      where: { dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}` },
    });
    if (existing) return existing;
    const w = await tx.withdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
      include: { bankAccount: true },
    });
    if (!w.bankAccount.paystackRecipientCode)
      throw new ApiError(409, 'MISSING_RECIPIENT', 'withdrawal requires operator reconciliation');
    const reference = w.paystackTransferRef ?? `wd_${w.id}`;
    return tx.paymentOperation.create({
      data: {
        kind: 'WITHDRAWAL_TRANSFER',
        dedupeKey: `WITHDRAWAL_TRANSFER:${w.id}`,
        status: w.status === 'PAID' ? 'RECORDED' : w.status === 'FAILED' ? 'FAILED' : 'PENDING',
        payload: {
          withdrawalId: w.id,
          amountKobo: w.amount,
          recipientCode: w.bankAccount.paystackRecipientCode,
          reference,
        },
      },
    });
  }, TX);
}

/** Accumulated platform fees still sitting in the Balance (FEE minus prior sweeps). */
export async function commissionSweepAmount(prisma: PrismaClient): Promise<number> {
  const [fees, swept] = await Promise.all([
    prisma.escrowLedger.aggregate({ where: { entryType: 'FEE' }, _sum: { amount: true } }),
    prisma.escrowLedger.aggregate({
      where: { entryType: 'COMMISSION_SWEEP' },
      _sum: { amount: true },
    }),
  ]);
  // Fees and outgoing sweeps are negative; a returned sweep appends a positive
  // COMMISSION_SWEEP, so this aggregate measures the net amount extracted.
  const totalFees = -(fees._sum.amount ?? 0);
  const totalSwept = -(swept._sum.amount ?? 0);
  return totalFees - totalSwept;
}

/** Reserve commission across periods so an unrecorded transfer cannot be swept again. */
export async function runCommissionSweep(
  deps: Deps,
  params: { operatingRecipientCode: string; minKobo?: number; period?: string },
): Promise<{ swept: number }> {
  const period = params.period ?? new Date().toISOString().slice(0, 10);
  const op = await deps.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(74011001)::text`;
    const dedupeKey = `COMMISSION_SWEEP:${period}`;
    const existing = await tx.paymentOperation.findUnique({ where: { dedupeKey } });
    if (existing) return existing;
    const [fees, sweeps, pending] = await Promise.all([
      tx.escrowLedger.aggregate({ where: { entryType: 'FEE' }, _sum: { amount: true } }),
      tx.escrowLedger.aggregate({
        where: { entryType: 'COMMISSION_SWEEP' },
        _sum: { amount: true },
      }),
      tx.paymentOperation.findMany({
        where: { kind: 'COMMISSION_SWEEP', status: { in: ['PENDING', 'PROVIDER_OK'] } },
      }),
    ]);
    const reserved = pending.reduce(
      (sum, row) => sum + (row.payload as unknown as TransferPayload).amountKobo,
      0,
    );
    const available = -(fees._sum.amount ?? 0) + (sweeps._sum.amount ?? 0) - reserved;
    if (!Number.isSafeInteger(available)) throw new ApiError(409, 'AMOUNT_LIMIT', 'commission aggregate requires operator reconciliation');
    // Each provider dispatch must fit the eventual signed Int32 ledger row.
    // Unswept fees remain available for a subsequent period.
    const amount = Math.min(available, MAX_INT32_KOBO);
    if (amount < (params.minKobo ?? 10_000)) return null;
    return tx.paymentOperation.create({
      data: {
        kind: 'COMMISSION_SWEEP',
        dedupeKey,
        payload: {
          amountKobo: amount,
          recipientCode: params.operatingRecipientCode,
          reference: `sweep_${period}`,
        },
      },
    });
  }, TX);
  if (!op) return { swept: 0 };
  const result = await driveTransfer(deps, op);
  return { swept: result.result ?? 0 };
}
