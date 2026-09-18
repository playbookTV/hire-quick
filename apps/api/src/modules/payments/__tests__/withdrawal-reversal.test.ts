import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { holdOrder, markCheckedIn, releaseBooking, requestWithdrawal, completeWithdrawal } from '../ledger/ledger.js';
import { dispatchPaystackEvent } from '../webhooks/paystack-webhook.js';
import { resumePaymentOperation } from '../recovery.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

const scenarios: Scenario[] = [];
let validated = false;
beforeAll(async () => { await assertDisposableDatabase(); validated = true; });
afterEach(async () => {
  vi.restoreAllMocks();
  if (!validated) return;
  await prisma.walletLedger.deleteMany({ where: { walletId: { in: scenarios.map((s) => s.walletId) } } });
  for (const s of scenarios.splice(0).reverse()) await teardown(s);
});

async function credit(s: Scenario) {
  await prisma.$transaction(async (tx) => {
    await holdOrder(tx, s.orderId, `hq_${s.orderId}`);
    for (const id of s.bookingIds) {
      await markCheckedIn(tx, id, 'AUTO');
      await releaseBooking(tx, id, 'AUTO');
    }
  }, { timeout: 30_000, maxWait: 30_000 });
}

describe('durable capacity-blocked withdrawal reversals', () => {
  it('keeps a capacity-blocked reversal authoritative over success returned by an in-flight verification', async () => {
    const s = await createScenario({ headcount: 2, amountKobo: 1_000_000_000 });
    scenarios.push(s);
    await credit(s);
    const bank = await prisma.bankAccount.create({ data: {
      usherId: s.usherId, verified: true, bankCode: '058', accountNumber: '0000000000',
      accountName: 'Verification race', paystackRecipientCode: 'rcp_test',
    } });
    const op = await prisma.$transaction(async (tx) => {
      const id = await requestWithdrawal(tx, s.walletId, bank.id, 100_000_000);
      return tx.paymentOperation.create({ data: {
        kind: 'WITHDRAWAL_TRANSFER', dedupeKey: `WITHDRAWAL_TRANSFER:${id}`, status: 'PENDING',
        payload: { withdrawalId: id, amountKobo: 100_000_000, recipientCode: 'rcp_test', reference: `wd_${id}` },
      } });
    }, { timeout: 30_000, maxWait: 30_000 });
    const { withdrawalId, reference } = op.payload as { withdrawalId: string; reference: string };
    const extra = await createScenario({ headcount: 1, amountKobo: 600_000_000 });
    scenarios.push(extra);
    await prisma.booking.update({ where: { id: extra.bookingIds[0]! }, data: { usherId: s.usherId } });
    await credit(extra); // 2.11 billion kobo: the reversal cannot yet be credited.

    let entered!: () => void;
    let release!: () => void;
    const verifying = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const paystack = new InMemoryPaystack();
    const verify = vi.spyOn(paystack, 'verifyTransfer').mockImplementationOnce(async () => {
      entered();
      await blocked;
      return { status: 'success' };
    });
    const transfer = vi.spyOn(paystack, 'transfer');
    // Capture rejection immediately so a failing assertion cannot leave an unhandled promise.
    const running = resumePaymentOperation({ prisma, paystack }, op).then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    try {
      await Promise.race([verifying, running.then(() => { throw new Error('Recovery ended before verification barrier'); })]);
      await expect(dispatchPaystackEvent(prisma, {
        event: 'transfer.reversed', data: { reference, amount: 100_000_000, currency: 'NGN' },
      })).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
      // A delayed success callback cannot override the already durable reversal either.
      await expect(dispatchPaystackEvent(prisma, {
        event: 'transfer.success', data: { reference, amount: 100_000_000, currency: 'NGN' },
      })).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
      expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })).status).toBe('PROCESSING');
    } finally {
      release();
      await running;
    }
    expect(await running).toMatchObject({ error: { code: 'BALANCE_LIMIT' } });
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })).status).toBe('PROCESSING');
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe('PENDING');
    expect(await prisma.paymentOperation.findUniqueOrThrow({ where: { dedupeKey: `WITHDRAWAL_REVERSAL:${withdrawalId}` } }))
      .toMatchObject({ status: 'PROVIDER_OK', providerRef: null, lastError: expect.stringContaining('BALANCE_LIMIT') });
    expect(await prisma.walletLedger.count({ where: { withdrawalId, entryType: 'REVERSAL' } })).toBe(0);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(2_110_000_000);

    await prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, 100_000_000));
    await resumePaymentOperation({ prisma, paystack }, op);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })).status).toBe('FAILED');
    expect(await prisma.walletLedger.count({ where: { withdrawalId, entryType: 'REVERSAL' } })).toBe(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(transfer).not.toHaveBeenCalled();
  }, 120_000);

  it('keeps a late reversal retryable and credits exactly once after capacity becomes available', async () => {
    const s = await createScenario({ headcount: 2, amountKobo: 1_000_000_000 });
    scenarios.push(s);
    await credit(s); // 1.7 billion kobo, all from ledger credits.
    const bank = await prisma.bankAccount.create({ data: {
      usherId: s.usherId, verified: true, bankCode: '058', accountNumber: '0000000000',
      accountName: 'Boundary test', paystackRecipientCode: 'rcp_test',
    } });
    const withdrawalId = await prisma.$transaction(async (tx) => {
      const id = await requestWithdrawal(tx, s.walletId, bank.id, 100_000_000);
      await completeWithdrawal(tx, id, `wd_${id}`);
      await tx.paymentOperation.create({ data: {
        kind: 'WITHDRAWAL_TRANSFER', dedupeKey: `WITHDRAWAL_TRANSFER:${id}`, status: 'RECORDED',
        providerRef: `wd_${id}`,
        payload: { withdrawalId: id, amountKobo: 100_000_000, recipientCode: 'rcp_test', reference: `wd_${id}` },
      } });
      return id;
    }, { timeout: 30_000, maxWait: 30_000 });
    const extra = await createScenario({ headcount: 1, amountKobo: 600_000_000 });
    scenarios.push(extra);
    await prisma.booking.update({ where: { id: extra.bookingIds[0]! }, data: { usherId: s.usherId } });
    await credit(extra); // same wallet now 2.11 billion, below Int32 ceiling.
    const event = { event: 'transfer.reversed', data: { reference: `wd_${withdrawalId}`, amount: 100_000_000, currency: 'NGN' } };
    await expect(dispatchPaystackEvent(prisma, event)).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
    const intent = await prisma.paymentOperation.findUniqueOrThrow({ where: { dedupeKey: `WITHDRAWAL_REVERSAL:${withdrawalId}` } });
    expect(intent).toMatchObject({
      status: 'PROVIDER_OK', providerRef: null, lastError: expect.stringContaining('BALANCE_LIMIT'),
      payload: { action: 'REVERSE', withdrawalId, amountKobo: 100_000_000, reversalReference: event.data.reference },
    });
    expect(await prisma.paymentOperation.findUniqueOrThrow({ where: { providerRef: event.data.reference } }))
      .toMatchObject({ dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}`, status: 'RECORDED' });
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })).status).toBe('PAID');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(2_110_000_000);

    // A separately authorized withdrawal creates capacity; recovery never sends money.
    await prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, 100_000_000));
    const paystack = new InMemoryPaystack();
    const transfer = vi.spyOn(paystack, 'transfer');
    const verify = vi.spyOn(paystack, 'verifyTransfer');
    await Promise.all([
      resumePaymentOperation({ prisma, paystack }, intent),
      resumePaymentOperation({ prisma, paystack }, intent),
      dispatchPaystackEvent(prisma, event),
    ]);
    expect(transfer).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })).status).toBe('FAILED');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(2_110_000_000);
    expect(await prisma.walletLedger.count({ where: { withdrawalId, entryType: 'REVERSAL' } })).toBe(1);
    expect(await prisma.paymentOperation.findUniqueOrThrow({ where: { id: intent.id } }))
      .toMatchObject({ status: 'RECORDED', providerRef: null });
    expect(await prisma.paymentOperation.findUniqueOrThrow({ where: { providerRef: event.data.reference } }))
      .toMatchObject({ dedupeKey: `WITHDRAWAL_TRANSFER:${withdrawalId}`, status: 'FAILED' });
  }, 120_000);

  it('rejects mismatched terminal evidence before creating a reversal intent', async () => {
    const s = await createScenario({ headcount: 1 });
    scenarios.push(s);
    await credit(s);
    const bank = await prisma.bankAccount.create({ data: {
      usherId: s.usherId, verified: true, bankCode: '058', accountNumber: randomUUID().slice(0, 10), accountName: 'Test',
    } });
    const id = await prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, 100));
    await expect(dispatchPaystackEvent(prisma, { event: 'transfer.failed', data: { reference: `wd_${id}`, amount: 101 } })).rejects.toThrow('does not match');
    expect(await prisma.paymentOperation.count({ where: { dedupeKey: `WITHDRAWAL_REVERSAL:${id}` } })).toBe(0);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('PROCESSING');
  });
});
