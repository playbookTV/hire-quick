/** Real ledger effects and rollback; only the orchestrator runs this against disposable storage. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import { kobo, MAX_INT32_KOBO, PLATFORM_FEE_BPS, splitFee } from '@hq/shared';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import {
  holdOrder,
  markCheckedIn,
  releaseBooking,
  resolveDisputeRelease,
  freezeBooking,
  requestWithdrawal,
  completeWithdrawal,
  failWithdrawal,
  refundBooking,
  commissionSweep,
} from '../ledger/ledger.js';
import { createScenario, teardown, bookingLedgerSum, type Scenario } from './fixtures.js';
import { reconcile } from '../ledger/reconciliation.js';
import { InMemoryPaystack } from '../port/paystack-port.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
const scenarios: Scenario[] = [];
let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});
afterEach(async () => {
  if (!validated) return;
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS ledger_test_forbid_hold ON escrow_ledger');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS ledger_test_forbid_hold()');
  // Cross-order fixtures deliberately share a payee; remove their selected ledger references first.
  await prisma.walletLedger.deleteMany({
    where: { bookingId: { in: scenarios.flatMap((s) => s.bookingIds) } },
  });
  for (const s of [...scenarios].reverse()) await teardown(s);
  scenarios.length = 0;
});
async function fixture(amountKobo = 10000, payee?: Scenario, headcount = 1) {
  const s = await createScenario({ amountKobo, headcount });
  scenarios.push(s);
  if (payee)
    await prisma.booking.updateMany({
      where: { id: { in: s.bookingIds } },
      data: { usherId: payee.usherId },
    });
  return s;
}
async function funded(s: Scenario) {
  await prisma.$transaction(async (tx) => {
    await holdOrder(tx, s.orderId, `bounds-${s.orderId}`);
    for (const id of s.bookingIds) await markCheckedIn(tx, id, 'OTP');
  }, TX);
}
async function release(s: Scenario) {
  await prisma.$transaction((tx) => releaseBooking(tx, s.bookingIds[0]!, 'OTP'), TX);
}
function grossForPayout(target: number): number {
  let gross = Math.floor((target * 10000) / (10000 - PLATFORM_FEE_BPS));
  while (splitFee(kobo(gross), PLATFORM_FEE_BPS).payout < target) gross++;
  while (splitFee(kobo(gross), PLATFORM_FEE_BPS).payout > target) gross--;
  return gross;
}
async function walletAt(target: number) {
  const first = await fixture(2_000_000_000);
  await funded(first);
  await release(first);
  const second = await fixture(grossForPayout(target - 1_700_000_000), first);
  await funded(second);
  await release(second);
  return first;
}
async function assertWalletSum(walletId: string, expected: number) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  const sum = await prisma.walletLedger.aggregate({ where: { walletId }, _sum: { amount: true } });
  expect(wallet.availableBalance).toBe(expected);
  expect(sum._sum.amount).toBe(expected);
}
async function assertNoHold(s: Scenario) {
  expect(await prisma.escrowLedger.count({ where: { bookingId: { in: s.bookingIds } } })).toBe(0);
  expect((await prisma.order.findUniqueOrThrow({ where: { id: s.orderId } })).status).toBe(
    'PENDING',
  );
  expect(
    (await prisma.booking.findMany({ where: { id: { in: s.bookingIds } } })).every(
      (b) => b.status === 'PENDING_PAYMENT',
    ),
  ).toBe(true);
}

describe('ledger conservation and accumulated limits', () => {
  it('checks the complete allocation before attempting any HOLD write', async () => {
    const s = await fixture(10000, undefined, 2);
    await prisma.order.update({ where: { id: s.orderId }, data: { grossAmount: 19999 } });
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION ledger_test_forbid_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HOLD write attempted before validation'; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER ledger_test_forbid_hold BEFORE INSERT ON escrow_ledger FOR EACH ROW EXECUTE FUNCTION ledger_test_forbid_hold()',
    );
    await expect(
      prisma.$transaction((tx) => holdOrder(tx, s.orderId, 'mismatch'), TX),
    ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
    await assertNoHold(s);
    expect(await prisma.payment.count({ where: { bookingId: { in: s.bookingIds } } })).toBe(0);
  });
  it('rejects a corrupt existing payment before holding any booking', async () => {
    const s = await fixture(10000, undefined, 2);
    const payment = await prisma.payment.create({
      data: {
        bookingId: s.bookingIds[1]!,
        grossAmount: 10000,
        platformFee: 1500,
        usherPayout: 8499,
      },
    });
    await expect(
      prisma.$transaction((tx) => holdOrder(tx, s.orderId, 'bad-payment'), TX),
    ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
    await assertNoHold(s);
    expect(await prisma.payment.count({ where: { bookingId: { in: s.bookingIds } } })).toBe(1);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).usherPayout,
    ).toBe(8499);
  });
  it('rejects a zero allocation even when its sum matches a positive order gross', async () => {
    const s = await fixture(10000, undefined, 2);
    await prisma.booking.update({ where: { id: s.bookingIds[0]! }, data: { amount: 0 } });
    await prisma.order.update({ where: { id: s.orderId }, data: { grossAmount: 10000 } });
    await expect(
      prisma.$transaction((tx) => holdOrder(tx, s.orderId, 'zero'), TX),
    ).rejects.toMatchObject({ code: 'BAD_AMOUNT' });
    await assertNoHold(s);
  });
  it('rejects cumulative allocations beyond Int32 even when each allocation fits', async () => {
    const s = await fixture(1, undefined, 2);
    await prisma.booking.updateMany({
      where: { id: { in: s.bookingIds } },
      data: { amount: MAX_INT32_KOBO },
    });
    await prisma.order.update({ where: { id: s.orderId }, data: { grossAmount: MAX_INT32_KOBO } });
    await expect(
      prisma.$transaction((tx) => holdOrder(tx, s.orderId, 'overflow'), TX),
    ).rejects.toMatchObject({ code: 'AMOUNT_LIMIT' });
    await assertNoHold(s);
  });
  it('holds the exact Int32 allocation ceiling without rounding or drift', async () => {
    const s = await fixture(MAX_INT32_KOBO);
    await prisma.$transaction((tx) => holdOrder(tx, s.orderId, 'ceiling'), TX);
    expect(await bookingLedgerSum(s.bookingIds[0]!)).toBe(MAX_INT32_KOBO);
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { bookingId: s.bookingIds[0]! },
    });
    expect(payment.platformFee + payment.usherPayout).toBe(MAX_INT32_KOBO);
  });
  it.each(['normal', 'dispute'] as const)(
    'rejects corrupt payment conservation on %s release without moving money',
    async (mode) => {
      const s = await fixture();
      await funded(s);
      if (mode === 'dispute')
        await prisma.$transaction((tx) => freezeBooking(tx, s.bookingIds[0]!), TX);
      await prisma.payment.update({
        where: { bookingId: s.bookingIds[0]! },
        data: { usherPayout: 8499 },
      });
      await expect(
        prisma.$transaction(
          (tx) =>
            mode === 'normal'
              ? releaseBooking(tx, s.bookingIds[0]!, 'OTP')
              : resolveDisputeRelease(tx, s.bookingIds[0]!),
          TX,
        ),
      ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
      expect(await bookingLedgerSum(s.bookingIds[0]!)).toBe(10000);
      expect(await prisma.walletLedger.count({ where: { walletId: s.walletId } })).toBe(0);
    },
  );
  it('repeated real credits reach the ceiling; one extra kobo rolls back all release effects and preserves reconciliation', async () => {
    const payee = await walletAt(MAX_INT32_KOBO);
    const extra = await fixture(1, payee);
    await funded(extra);
    const provider = new InMemoryPaystack();
    const before = await reconcile(prisma, provider);
    provider.setBalanceKobo(before.expectedKobo);
    await expect(release(extra)).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
    await assertWalletSum(payee.walletId, MAX_INT32_KOBO);
    expect(await bookingLedgerSum(extra.bookingIds[0]!)).toBe(1);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: extra.bookingIds[0]! } })).status,
    ).toBe('CHECKED_IN');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { bookingId: extra.bookingIds[0]! } }))
        .escrowStatus,
    ).toBe('HELD');
    const after = await reconcile(prisma, provider);
    expect(after.expectedKobo).toBe(before.expectedKobo);
    expect(after.driftKobo).toBe(0);
  });
  it('serializes simultaneous last-kobo credits from different orders', async () => {
    const payee = await walletAt(MAX_INT32_KOBO - 1);
    const a = await fixture(1, payee),
      b = await fixture(1, payee);
    await funded(a);
    await funded(b);
    const results = await Promise.allSettled([release(a), release(b)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'BALANCE_LIMIT' },
    });
    await assertWalletSum(payee.walletId, MAX_INT32_KOBO);
    expect(
      (await bookingLedgerSum(a.bookingIds[0]!)) + (await bookingLedgerSum(b.bookingIds[0]!)),
    ).toBe(1);
  });
  it('an over-ceiling withdrawal reversal remains unapplied and can be retried after capacity is freed', async () => {
    const payee = await walletAt(MAX_INT32_KOBO);
    const bank = await prisma.bankAccount.create({
      data: {
        usherId: payee.usherId,
        bankCode: '058',
        accountNumber: '0000000000',
        accountName: 'Fixture',
        verified: true,
      },
    });
    const first = await prisma.$transaction(
      (tx) => requestWithdrawal(tx, payee.walletId, bank.id, 1),
      TX,
    );
    await prisma.$transaction((tx) => completeWithdrawal(tx, first, 'first-transfer'), TX);
    const extra = await fixture(1, payee);
    await funded(extra);
    await release(extra);
    await expect(prisma.$transaction((tx) => failWithdrawal(tx, first), TX)).rejects.toMatchObject({
      code: 'BALANCE_LIMIT',
    });
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: first } })).status).toBe(
      'PAID',
    );
    expect(
      await prisma.walletLedger.count({ where: { withdrawalId: first, entryType: 'REVERSAL' } }),
    ).toBe(0);
    await prisma.$transaction((tx) => requestWithdrawal(tx, payee.walletId, bank.id, 1), TX);
    await prisma.$transaction((tx) => failWithdrawal(tx, first), TX);
    await assertWalletSum(payee.walletId, MAX_INT32_KOBO);
    expect(
      await prisma.walletLedger.count({ where: { withdrawalId: first, entryType: 'REVERSAL' } }),
    ).toBe(1);
  });
  it('retains legacy zero-value refunds without a payment or captured charge', async () => {
    const s = await fixture(0);
    await prisma.booking.update({ where: { id: s.bookingIds[0]! }, data: { status: 'CANCELLED' } });
    await prisma.order.update({ where: { id: s.orderId }, data: { status: 'PAID' } });
    await prisma.$transaction((tx) => refundBooking(tx, s.bookingIds[0]!, 0), TX);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingIds[0]! } })).status,
    ).toBe('REFUNDED');
    expect(await bookingLedgerSum(s.bookingIds[0]!)).toBe(0);
  });
  it.each([1.5, NaN, MAX_INT32_KOBO + 1])(
    'rejects invalid withdrawal/refund/sweep amount %s before recording effects',
    async (amount) => {
      const s = await fixture();
      await funded(s);
      await release(s);
      const bank = await prisma.bankAccount.create({
        data: {
          usherId: s.usherId,
          bankCode: '058',
          accountNumber: '0000000000',
          accountName: 'Fixture',
          verified: true,
        },
      });
      await expect(
        prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, amount), TX),
      ).rejects.toThrow();
      await expect(
        prisma.$transaction((tx) => refundBooking(tx, s.bookingIds[0]!, amount), TX),
      ).rejects.toThrow();
      await expect(prisma.$transaction((tx) => commissionSweep(tx, amount), TX)).rejects.toThrow();
      expect(await prisma.withdrawal.count({ where: { walletId: s.walletId } })).toBe(0);
      await assertWalletSum(s.walletId, 8500);
    },
  );
});
