/**
 * Release-readiness remediation regressions (TRD §10/§17):
 *  - refunds are single-shot under concurrent retries (durable BOOKING_REFUND op);
 *  - withdrawal terminal transitions are idempotent and a reversal applies once;
 *  - idempotency replays the original result instead of an empty payload;
 *  - durable operations dedupe a concurrent claim by dedupeKey.
 * DB-backed; runs serially like the rest of the suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import { holdOrder, releaseBooking, requestWithdrawal, completeWithdrawal, failWithdrawal } from '../ledger/ledger.js';
import { runIdempotent } from '../ledger/idempotency.js';
import { claimOperation } from '../ledger/operations.js';
import { refundBookingToClient } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

/** InMemoryPaystack that counts refund() so we can assert at-most-once. */
class CountingPaystack extends InMemoryPaystack {
  refundCalls = 0;
  override refund(p: { chargeReference: string; amountKobo: number }): Promise<{ status: 'processed' }> {
    this.refundCalls += 1;
    return super.refund(p);
  }
}

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});

describe('payment remediation', () => {
  it('concurrent refunds of one booking call Paystack once and record one REFUND', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 1_000_000 });
    const ref = `hq_${scenario.orderId}`;
    await prisma.order.update({ where: { id: scenario.orderId }, data: { paystackChargeRef: ref } });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, ref));
    const bookingId = scenario.bookingIds[0]!;
    const paystack = new CountingPaystack();
    const deps = { prisma, paystack };

    const results = await Promise.allSettled([
      refundBookingToClient(deps, { bookingId, amountKobo: 1_000_000, precursor: 'CANCEL' }),
      refundBookingToClient(deps, { bookingId, amountKobo: 1_000_000, precursor: 'CANCEL' }),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(paystack.refundCalls).toBe(1); // the dedupeKey claim stopped the second provider call
    const refundEntries = await prisma.escrowLedger.count({ where: { bookingId, entryType: 'REFUND' } });
    expect(refundEntries).toBe(1);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('REFUNDED');
  });

  it('withdrawal terminal transitions are idempotent and reversal credits the wallet once', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_wd'));
    const id = scenario.bookingIds[0]!;
    await prisma.booking.update({ where: { id }, data: { status: 'CHECKED_IN' } });
    await prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP'));
    const { payout } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);
    const bank = await prisma.bankAccount.create({
      data: { usherId: scenario.usherId, bankCode: '058', accountNumber: '0', accountName: 'T', verified: true },
    });
    const wdId = await prisma.$transaction((tx) => requestWithdrawal(tx, scenario!.walletId, bank.id, payout));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } })).availableBalance).toBe(0);

    // A duplicate transfer.success settles exactly once.
    expect(await prisma.$transaction((tx) => completeWithdrawal(tx, wdId, 'wd_ref'))).toBe(true);
    expect(await prisma.$transaction((tx) => completeWithdrawal(tx, wdId, 'wd_ref'))).toBe(false);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: wdId } })).status).toBe('PAID');

    // A reversal after PAID re-credits the wallet once; a duplicate reversal no-ops.
    expect(await prisma.$transaction((tx) => failWithdrawal(tx, wdId))).toBe(true);
    expect(await prisma.$transaction((tx) => failWithdrawal(tx, wdId))).toBe(false);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: wdId } })).status).toBe('FAILED');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } })).availableBalance).toBe(payout);
  });

  it('runIdempotent replays the original result on a duplicate', async () => {
    const key = `rk_${String(Date.now())}_${String(Math.round(Math.random() * 1e6))}`;
    const first = await runIdempotent(prisma, key, 'test', () =>
      Promise.resolve({ orderId: 'o1', bookingIds: ['b1'] }),
    );
    expect(first.duplicate).toBe(false);
    const second = await runIdempotent(prisma, key, 'test', () =>
      Promise.resolve({ orderId: 'SHOULD_NOT_RUN', bookingIds: [] }),
    );
    expect(second.duplicate).toBe(true);
    expect(second.result).toEqual({ orderId: 'o1', bookingIds: ['b1'] });
    await prisma.idempotencyKey.delete({ where: { key: `test:${key}` } });
  });

  it('claimOperation dedupes a concurrent claim by dedupeKey', async () => {
    const dedupeKey = `BOOKING_REFUND:rk_${String(Date.now())}_${String(Math.round(Math.random() * 1e6))}`;
    const [a, b] = await Promise.all([
      claimOperation(prisma, { kind: 'BOOKING_REFUND', dedupeKey, payload: {} }),
      claimOperation(prisma, { kind: 'BOOKING_REFUND', dedupeKey, payload: {} }),
    ]);
    expect(a.op.id).toBe(b.op.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1); // exactly one created the row
    await prisma.paymentOperation.delete({ where: { id: a.op.id } });
  });
});
