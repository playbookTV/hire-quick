import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { holdOrder, markCheckedIn, releaseBooking, requestWithdrawal } from '../ledger/ledger.js';
import { driveTransfer, initChargeForOrder, refundBookingToClient } from '../service.js';
import { dispatchPaystackEvent } from '../webhooks/paystack-webhook.js';
import { InMemoryPaystack, type PaystackPort } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

vi.mock('../../audit.js', () => ({ writeAudit: vi.fn() }));
let scenario: Scenario | undefined;
const opIds: string[] = [];
let sweepStart: Date | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (scenario) await teardown(scenario);
  await prisma.paymentOperation.deleteMany({ where: { id: { in: opIds } } });
  if (sweepStart) await prisma.escrowLedger.deleteMany({
    where: { bookingId: null, entryType: 'COMMISSION_SWEEP', createdAt: { gte: sweepStart } },
  });
  scenario = undefined;
  opIds.length = 0;
  sweepStart = undefined;
});
async function held() {
  scenario = await createScenario({ headcount: 1, amountKobo: 100_000 });
  await prisma.$transaction(tx => holdOrder(tx, scenario!.orderId, `hq-${scenario!.orderId}`));
  return scenario;
}
async function withdrawal() {
  const s = await held();
  await prisma.$transaction(async tx => {
    await markCheckedIn(tx, s.bookingIds[0]!, 'AUTO');
    await releaseBooking(tx, s.bookingIds[0]!, 'AUTO');
  });
  const bank = await prisma.bankAccount.create({ data: {
    usherId: s.usherId, bankCode: '058', accountNumber: '0000000000', accountName: 'Test',
    verified: true, paystackRecipientCode: 'rcp_test',
  } });
  const id = await prisma.$transaction(tx => requestWithdrawal(tx, s.walletId, bank.id, 50_000));
  const reference = `wd_${id}`;
  const op = await prisma.paymentOperation.create({ data: {
    kind: 'WITHDRAWAL_TRANSFER', dedupeKey: `WITHDRAWAL_TRANSFER:${id}`,
    payload: { withdrawalId: id, reference, amountKobo: 50_000, recipientCode: 'rcp_test' },
  } });
  return { s, id, reference, op };
}
async function sweep() {
  sweepStart = new Date();
  const reference = `sweep_${randomUUID()}`;
  const op = await prisma.paymentOperation.create({ data: {
    kind: 'COMMISSION_SWEEP', dedupeKey: `COMMISSION_SWEEP:${randomUUID()}`,
    payload: { reference, amountKobo: 10_000, recipientCode: 'rcp_test' },
  } });
  opIds.push(op.id);
  return { op, reference };
}
function event(event: string, reference: string, amount: number) {
  return { event, data: { reference, amount, currency: 'NGN' } };
}
async function operationStatus(id: string) {
  return (await prisma.paymentOperation.findUniqueOrThrow({ where: { id } })).status;
}

describe('terminal payment callbacks', () => {
  it('records success atomically with a pending withdrawal and recovery never reissues it', async () => {
    const { s, id, reference, op } = await withdrawal();
    await Promise.all(Array.from({ length: 3 }, () =>
      dispatchPaystackEvent(prisma, event('transfer.success', reference, 50_000))));
    expect(await operationStatus(op.id)).toBe('RECORDED');
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('PAID');
    const paystack = new InMemoryPaystack();
    const transfer = vi.spyOn(paystack, 'transfer');
    await driveTransfer({ prisma, paystack }, op);
    expect(transfer).not.toHaveBeenCalled();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(35_000);
  });
  it('reverses a recorded withdrawal once and ignores later success', async () => {
    const { s, id, reference, op } = await withdrawal();
    await dispatchPaystackEvent(prisma, event('transfer.success', reference, 50_000));
    await Promise.all(['transfer.reversed', 'transfer.failed', 'transfer.reversed'].map(type =>
      dispatchPaystackEvent(prisma, event(type, reference, 50_000))));
    await dispatchPaystackEvent(prisma, event('transfer.success', reference, 50_000));
    expect(await operationStatus(op.id)).toBe('FAILED');
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('FAILED');
    expect(await prisma.walletLedger.count({ where: { withdrawalId: id, entryType: 'REVERSAL' } })).toBe(1);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(85_000);
  });
  it('rejects mismatched callback evidence without changing the operation or wallet', async () => {
    const { id, reference, op } = await withdrawal();
    await expect(dispatchPaystackEvent(prisma, event('transfer.success', reference, 1))).rejects.toThrow(/match/);
    await expect(dispatchPaystackEvent(prisma, {
      event: 'transfer.failed', data: { reference, amount: 50_000, currency: 'USD' },
    })).rejects.toThrow(/match/);
    expect(await operationStatus(op.id)).toBe('PENDING');
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('PROCESSING');
  });
  it('records a commission callback racing recovery once and appends one reversal', async () => {
    const { op, reference } = await sweep();
    const paystack = new InMemoryPaystack();
    vi.spyOn(paystack, 'verifyTransfer').mockResolvedValue({ status: 'success' });
    await Promise.all([
      driveTransfer({ prisma, paystack }, op),
      dispatchPaystackEvent(prisma, event('transfer.success', reference, 10_000)),
    ]);
    expect(await operationStatus(op.id)).toBe('RECORDED');
    await Promise.all(['transfer.reversed', 'transfer.failed'].map(type =>
      dispatchPaystackEvent(prisma, event(type, reference, 10_000))));
    await dispatchPaystackEvent(prisma, event('transfer.success', reference, 10_000));
    expect(await operationStatus(op.id)).toBe('FAILED');
    const entries = await prisma.escrowLedger.findMany({
      where: { bookingId: null, entryType: 'COMMISSION_SWEEP', createdAt: { gte: sweepStart! } },
    });
    expect(entries.map(e => e.amount).sort((a, b) => a - b)).toEqual([-10_000, 10_000]);
  });
  it('fails an unrecorded sweep without inventing ledger money', async () => {
    const { op, reference } = await sweep();
    await dispatchPaystackEvent(prisma, event('transfer.failed', reference, 10_000));
    expect(await operationStatus(op.id)).toBe('FAILED');
    expect(await prisma.escrowLedger.count({ where: {
      bookingId: null, entryType: 'COMMISSION_SWEEP', createdAt: { gte: sweepStart! },
    } })).toBe(0);
  });
  it.each(['processed', 'failed'] as const)('reconciles refund.%s with GET evidence and no second POST', async status => {
    const s = await held();
    const paystack: PaystackPort = new InMemoryPaystack();
    const post = vi.spyOn(paystack, 'refund').mockResolvedValue({ status: 'pending' });
    await refundBookingToClient({ prisma, paystack }, {
      bookingId: s.bookingIds[0]!, amountKobo: 100_000, precursor: 'CANCEL',
    });
    vi.spyOn(paystack, 'verifyRefund').mockResolvedValue({ status });
    const callback = { event: `refund.${status}`, data: { merchant_note: `BOOKING_REFUND:${s.bookingIds[0]}` } };
    await dispatchPaystackEvent(prisma, callback, undefined, paystack);
    await dispatchPaystackEvent(prisma, callback, undefined, paystack);
    expect(post).toHaveBeenCalledTimes(1);
    const op = await prisma.paymentOperation.findUniqueOrThrow({ where: { dedupeKey: callback.data.merchant_note } });
    expect(op.status).toBe(status === 'processed' ? 'RECORDED' : 'FAILED');
    expect(await prisma.escrowLedger.count({ where: { bookingId: s.bookingIds[0]!, entryType: 'REFUND' } })).toBe(status === 'processed' ? 1 : 0);
  });
  it('does not consume the first dispatch of an unattempted refund from a callback', async () => {
    const s = await held();
    const op = await prisma.paymentOperation.create({ data: {
      kind: 'BOOKING_REFUND', dedupeKey: `BOOKING_REFUND:${s.bookingIds[0]}`,
      payload: { bookingId: s.bookingIds[0]!, amountKobo: 100_000, precursor: 'CANCEL', chargeReference: `hq-${s.orderId}` },
    } });
    const paystack = new InMemoryPaystack();
    const post = vi.spyOn(paystack, 'refund');
    await dispatchPaystackEvent(prisma, {
      event: 'refund.processed', data: { merchant_note: op.dedupeKey },
    }, undefined, paystack);
    expect(post).not.toHaveBeenCalled();
    expect(await operationStatus(op.id)).toBe('PENDING');
    expect((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).attempts).toBe(0);
    await prisma.paymentOperation.update({ where: { id: op.id }, data: { attempts: 1 } });
    await expect(dispatchPaystackEvent(prisma, {
      event: 'refund.processed', data: { merchant_note: op.dedupeKey },
    }, undefined, paystack)).rejects.toThrow(/not yet available/);
  });
});

describe('charge initialization reference', () => {
  it('preserves a legacy reference without blindly initializing its uncertain checkout', async () => {
    scenario = await createScenario({ headcount: 1 });
    const paystack = new InMemoryPaystack();
    const params = { orderId: scenario.orderId, clientUserId: scenario.clientUserId, email: 'test@example.com' };
    const initialize = vi.spyOn(paystack, 'initializeCharge');
    await prisma.order.update({ where: { id: scenario.orderId }, data: { paystackChargeRef: 'legacy-reference' } });
    const result = await initChargeForOrder({ prisma, paystack }, params);
    expect(result.reference).toBe('legacy-reference');
    expect(result.state).toBe('REVIEW');
    expect(initialize).not.toHaveBeenCalled();
  });
});
