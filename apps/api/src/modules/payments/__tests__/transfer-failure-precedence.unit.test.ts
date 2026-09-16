import { describe, expect, it, vi } from 'vitest';
import type { PaymentOperation, PrismaClient } from '@hq/database';
import { driveTransfer } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { driveWithdrawalReversal } from '../withdrawal-reversal.js';
import { reconcileStuckWithdrawals } from '../recovery.js';
import { LedgerError } from '../ledger/ledger.js';

vi.mock('../withdrawal-reversal.js', () => ({
  isWithdrawalReversal: () => false,
  recordWithdrawalReversal: vi.fn(),
  driveWithdrawalReversal: vi.fn().mockRejectedValue(Object.assign(new Error('capacity blocked'), { code: 'BALANCE_LIMIT' })),
}));

describe('persisted terminal transfer failure takes precedence', () => {
  it('routes a stale original pending intent to local reversal recovery before any provider call', async () => {
    const reversal = { id: 'reversal', status: 'PROVIDER_OK' } as PaymentOperation;
    const findUnique = vi.fn().mockResolvedValue(reversal);
    const prisma = { paymentOperation: { findUnique } } as unknown as PrismaClient;
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'unknown' });
    const transfer = vi.spyOn(paystack, 'transfer');
    const op = { kind: 'WITHDRAWAL_TRANSFER', status: 'PENDING', payload: {
      withdrawalId: 'withdrawal', amountKobo: 100, reference: 'wd_withdrawal', recipientCode: 'rcp_test',
    } } as unknown as PaymentOperation;
    await expect(driveTransfer({ prisma, paystack }, op)).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
    expect(findUnique).toHaveBeenCalledWith({ where: { dedupeKey: 'WITHDRAWAL_REVERSAL:withdrawal' } });
    expect(driveWithdrawalReversal).toHaveBeenCalledWith(prisma, reversal);
    expect(verify).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  });

  it('honors a blocked reversal before the legacy RECORDED/PROCESSING repair branch', async () => {
    const reversal = { id: 'reversal', status: 'PROVIDER_OK' } as PaymentOperation;
    const original = { id: 'original', status: 'RECORDED', payload: { reference: 'wd_withdrawal' } };
    const tx = { $queryRaw: vi.fn(), paymentOperation: { findUnique: vi.fn().mockResolvedValue(original) } };
    const prisma = {
      withdrawal: { findMany: vi.fn().mockResolvedValue([{ id: 'withdrawal' }]) },
      paymentOperation: { findUnique: vi.fn().mockResolvedValue(reversal) },
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaClient;
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'success' });
    const transfer = vi.spyOn(paystack, 'transfer');
    vi.mocked(driveWithdrawalReversal).mockRejectedValueOnce(new LedgerError('BALANCE_LIMIT', 'capacity blocked'));
    await expect(reconcileStuckWithdrawals({ prisma, paystack })).resolves.toEqual({ completed: 0, failed: 0, pending: 1 });
    expect(driveWithdrawalReversal).toHaveBeenCalledWith(prisma, reversal);
    expect(verify).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  });
});
