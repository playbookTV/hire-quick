import { describe, expect, it, vi } from 'vitest';
import type { PaymentOperation, PrismaClient } from '@hq/database';
import { MAX_INT32_KOBO } from '@hq/shared';
import { driveTransfer, runCommissionSweep } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';

vi.mock('../ledger/operations.js', () => ({
  runOperation: async (_db: unknown, op: PaymentOperation, handlers: { provider: () => Promise<unknown> }) => {
    await handlers.provider();
    return { status: 'RECORDED', result: (op.payload as { amountKobo: number }).amountKobo };
  },
}));

function fixture(available: number) {
  const create = vi.fn(({ data }: { data: object }) => ({ id: 'op', status: 'PENDING', ...data }));
  const tx = {
    $queryRaw: vi.fn(),
    escrowLedger: { aggregate: vi.fn(({ where }: { where: { entryType: string } }) => ({
      _sum: { amount: where.entryType === 'FEE' ? -available : 0 },
    })) },
    paymentOperation: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create },
  };
  const prisma = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
  const paystack = new InMemoryPaystack();
  const transfer = vi.spyOn(paystack, 'transfer');
  return { deps: { prisma, paystack }, create, transfer };
}

describe('commission dispatch integer ceiling', () => {
  it('caps the persisted intent and actual provider request before dispatch', async () => {
    const f = fixture(MAX_INT32_KOBO + 500_000);
    expect(await runCommissionSweep(f.deps, { operatingRecipientCode: 'rcp_test', period: 'boundary' })).toEqual({ swept: MAX_INT32_KOBO });
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ amountKobo: MAX_INT32_KOBO }) }) }));
    expect(f.transfer).toHaveBeenCalledWith(expect.objectContaining({ amountKobo: MAX_INT32_KOBO, reference: 'sweep_boundary' }));
  });

  it('rejects an unsafe aggregate without reserving or sending money', async () => {
    const f = fixture(Number.MAX_SAFE_INTEGER + 1);
    await expect(runCommissionSweep(f.deps, { operatingRecipientCode: 'rcp_test' })).rejects.toMatchObject({ code: 'AMOUNT_LIMIT' });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.transfer).not.toHaveBeenCalled();
  });

  it('does not dispatch a legacy oversized transfer intent', async () => {
    const f = fixture(0);
    const op = { kind: 'COMMISSION_SWEEP', payload: { amountKobo: MAX_INT32_KOBO + 1, reference: 'legacy', recipientCode: 'rcp_test' } } as unknown as PaymentOperation;
    await expect(driveTransfer(f.deps, op)).rejects.toMatchObject({ code: 'AMOUNT_LIMIT' });
    expect(f.transfer).not.toHaveBeenCalled();
  });
});
