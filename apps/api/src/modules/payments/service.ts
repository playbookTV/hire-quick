/**
 * Phase 2 payment services: orchestrate Paystack (test mode) with the ledger.
 * Order + booking *creation* from applications is Phase 4; these compose on top
 * of an existing PENDING order.
 */
import { type PrismaClient } from '@hq/database';
import { ApiError } from '../../app.js';
import { runIdempotent } from './ledger/idempotency.js';
import { claimOperation, runOperation } from './ledger/operations.js';
import {
  requestWithdrawal,
  failWithdrawal,
  commissionSweep,
  refundBooking,
  cancelBooking,
  markNoShow,
} from './ledger/ledger.js';
import type { PaystackPort } from './port/paystack-port.js';
import type { RealtimeGateway } from '../../realtime/gateway.js';

const TX = { timeout: 30_000, maxWait: 30_000 };

export interface Deps {
  prisma: PrismaClient;
  paystack: PaystackPort;
  realtime?: RealtimeGateway;
}

/**
 * Refund a booking's allocation to the client — the ONLY refund entrypoint that
 * both moves money and records the ledger. The real Paystack refund (a partial
 * refund against the order's charge, TRD §10) fires FIRST, then the ledger
 * REFUND is recorded in one transaction — mirroring runCommissionSweep's
 * "external call first, ledger entry only on success" so a failed refund never
 * leaves a phantom REFUND in the ledger. A crash between a successful Paystack
 * refund and the ledger write degrades to reconciliation drift (caught by §17),
 * the same accepted tradeoff the sweep makes.
 *
 * `precursor` performs the booking's status step (CONFIRMED → CANCELLED/NO_SHOW)
 * inside the same ledger tx before the refund; omit it when the booking is
 * already in a refundable terminal-ish state (DISPUTED, or pre-cancelled).
 * Idempotent: a booking already REFUNDED is a no-op (never re-refunds Paystack).
 */
export async function refundBookingToClient(
  deps: Deps,
  params: { bookingId: string; amountKobo: number; precursor?: 'CANCEL' | 'NO_SHOW' | undefined },
): Promise<{ refunded: boolean }> {
  const booking = await deps.prisma.booking.findUniqueOrThrow({
    where: { id: params.bookingId },
    include: { order: true },
  });
  if (booking.status === 'REFUNDED') return { refunded: false }; // idempotent retry guard

  // Claim a durable BOOKING_REFUND operation FIRST. The unique dedupeKey is the
  // serialization point: a concurrent retry loses the insert and never reaches the
  // Paystack refund below, so a booking's allocation can be refunded at most once
  // (closes the double-refund race — TRD §10).
  const chargeRef = booking.order?.paystackChargeRef ?? null;
  if (params.amountKobo > 0 && !chargeRef) {
    throw new Error(`booking ${params.bookingId}: order has no charge reference to refund`);
  }
  const { op } = await claimOperation(deps.prisma, {
    kind: 'BOOKING_REFUND',
    dedupeKey: `BOOKING_REFUND:${params.bookingId}`,
    payload: { bookingId: params.bookingId, amountKobo: params.amountKobo, precursor: params.precursor ?? null },
  });
  const outcome = await runOperation(
    deps.prisma,
    op,
    {
      provider: async () => {
        if (params.amountKobo > 0 && chargeRef) {
          await deps.paystack.refund({ chargeReference: chargeRef, amountKobo: params.amountKobo });
        }
        return { ok: true };
      },
      onSuccess: async (tx) => {
        if (params.precursor === 'CANCEL') await cancelBooking(tx, params.bookingId);
        else if (params.precursor === 'NO_SHOW') await markNoShow(tx, params.bookingId);
        await refundBooking(tx, params.bookingId, params.amountKobo);
        return true;
      },
    },
    TX,
  );
  return { refunded: outcome.status === 'RECORDED' };
}

/** Initialize the Paystack charge for a PENDING order; HOLD happens on webhook. */
export async function initChargeForOrder(
  deps: Deps,
  params: { orderId: string; email: string; clientUserId: string },
): Promise<{ authorizationUrl: string; reference: string }> {
  const order = await deps.prisma.order.findUniqueOrThrow({
    where: { id: params.orderId },
    include: { client: { select: { userId: true } } },
  });
  // Only the client who owns the order may initialize its charge.
  if (order.client.userId !== params.clientUserId) {
    throw new ApiError(403, 'FORBIDDEN', 'not your order');
  }
  if (order.status !== 'PENDING') throw new Error(`order ${order.id} is not PENDING`);
  const reference = `hq_${order.id}`;
  const init = await deps.paystack.initializeCharge({
    email: params.email,
    amountKobo: order.grossAmount,
    reference,
  });
  await deps.prisma.order.update({ where: { id: order.id }, data: { paystackChargeRef: reference } });
  return init;
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
  params: { idempotencyKey: string; usherId: string; walletId: string; bankAccountId: string; amountKobo: number },
): Promise<{ withdrawalId: string; duplicate: boolean }> {
  const bank = await deps.prisma.bankAccount.findUniqueOrThrow({
    where: { id: params.bankAccountId },
  });
  // The destination must belong to the withdrawing usher — otherwise a caller
  // could route their own payout to anyone else's registered bank account.
  if (bank.usherId !== params.usherId) {
    throw new ApiError(403, 'FORBIDDEN', 'bank account does not belong to you');
  }
  if (!bank.paystackRecipientCode) throw new Error('bank account has no transfer recipient');
  const recipientCode = bank.paystackRecipientCode;

  const { duplicate, result } = await runIdempotent(
    deps.prisma,
    params.idempotencyKey,
    'withdrawal',
    (tx) => requestWithdrawal(tx, params.walletId, params.bankAccountId, params.amountKobo),
  );
  if (!result) return { withdrawalId: '', duplicate: true };
  // A duplicate request resumes with the original withdrawal id; the first call
  // already owns the transfer (and the recovery job resumes it if it crashed).
  if (duplicate) return { withdrawalId: result, duplicate: true };

  const withdrawalId = result;
  const reference = `wd_${withdrawalId}`;
  // The transfer + its bookkeeping run as a durable operation so a crash between
  // the wallet debit and the Paystack transfer leaves no stuck debit — the
  // recovery job re-issues the transfer (idempotent by `reference`) or reverses it.
  const { op } = await claimOperation(deps.prisma, {
    kind: 'WITHDRAWAL_TRANSFER',
    dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}`,
    payload: { withdrawalId, amountKobo: params.amountKobo, recipientCode, reference },
  });
  await runOperation(deps.prisma, op, {
    provider: async () => {
      const transfer = await deps.paystack.transfer({
        amountKobo: params.amountKobo,
        recipientCode,
        reason: 'HireQuick payout',
        reference,
      });
      return { ok: transfer.status !== 'failed', providerRef: reference };
    },
    // Success: persist the ref; transfer.success/failed webhooks finalize status.
    onSuccess: (tx) => tx.withdrawal.update({ where: { id: withdrawalId }, data: { paystackTransferRef: reference } }),
    // Synchronous failure → reverse immediately (funds stay in the wallet, §10).
    onFailure: async (tx) => {
      await failWithdrawal(tx, withdrawalId);
    },
  });
  return { withdrawalId, duplicate: false };
}

/** Accumulated platform fees still sitting in the Balance (FEE minus prior sweeps). */
export async function commissionSweepAmount(prisma: PrismaClient): Promise<number> {
  const [fees, swept] = await Promise.all([
    prisma.escrowLedger.aggregate({ where: { entryType: 'FEE' }, _sum: { amount: true } }),
    prisma.escrowLedger.aggregate({ where: { entryType: 'COMMISSION_SWEEP' }, _sum: { amount: true } }),
  ]);
  // FEE and COMMISSION_SWEEP are stored as negative amounts.
  const totalFees = -(fees._sum.amount ?? 0);
  const totalSwept = -(swept._sum.amount ?? 0);
  return totalFees - totalSwept;
}

/**
 * Sweep accumulated commission to HireQuick's operating bank (D3, §10). Transfer
 * first, then record the COMMISSION_SWEEP entry only on success, so a failed
 * transfer never leaves a phantom sweep in the ledger.
 */
export async function runCommissionSweep(
  deps: Deps,
  params: { operatingRecipientCode: string; minKobo?: number; period?: string },
): Promise<{ swept: number }> {
  const amount = await commissionSweepAmount(deps.prisma);
  const min = params.minKobo ?? 10_000; // ₦100 floor
  if (amount < min) return { swept: 0 };

  // One durable sweep per period (default: today) — the dedupeKey caps it at once
  // per day and makes the transfer→ledger pair recoverable. A resume uses the
  // amount captured at claim time (op.payload), never a recomputed figure, so a
  // crashed sweep can't double-record a different amount.
  const period = params.period ?? new Date().toISOString().slice(0, 10);
  const reference = `sweep_${period}`;
  const { op } = await claimOperation(deps.prisma, {
    kind: 'COMMISSION_SWEEP',
    dedupeKey: `COMMISSION_SWEEP:${period}`,
    payload: { amountKobo: amount, recipientCode: params.operatingRecipientCode, reference },
  });
  const payload = op.payload as { amountKobo: number; recipientCode: string; reference: string };
  const out = await runOperation(deps.prisma, op, {
    provider: async () => {
      const transfer = await deps.paystack.transfer({
        amountKobo: payload.amountKobo,
        recipientCode: payload.recipientCode,
        reason: 'HireQuick commission sweep',
        reference: payload.reference,
      });
      return { ok: transfer.status !== 'failed', providerRef: payload.reference };
    },
    onSuccess: async (tx) => {
      await commissionSweep(tx, payload.amountKobo);
      return payload.amountKobo;
    },
  });
  return { swept: out.result ?? 0 };
}
