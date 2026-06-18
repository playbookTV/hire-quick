import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import {
  holdOrder,
  releaseBooking,
  cancelBooking,
  refundBooking,
  freezeBooking,
  requestWithdrawal,
  completeWithdrawal,
  failWithdrawal,
  LedgerError,
} from '../ledger/ledger.js';
import { runIdempotent } from '../ledger/idempotency.js';
import { createScenario, teardown, bookingLedgerSum, type Scenario } from './fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});

async function markCheckedIn(bookingId: string): Promise<void> {
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CHECKED_IN' } });
}
async function makeBankAccount(usherId: string): Promise<string> {
  const ba = await prisma.bankAccount.create({
    data: { usherId, bankCode: '058', accountNumber: '0000000000', accountName: 'Test', verified: true },
  });
  return ba.id;
}

describe('ledger core (TRD §25)', () => {
  it('holdOrder: Σ HOLD == order gross; bookings CONFIRMED; escrow HELD', async () => {
    scenario = await createScenario({ headcount: 4, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_test_1'));

    const holds = await prisma.escrowLedger.aggregate({
      where: { bookingId: { in: scenario.bookingIds }, entryType: 'HOLD' },
      _sum: { amount: true },
    });
    expect(holds._sum.amount).toBe(2_000_000 * 4);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe('PAID');
    const bookings = await prisma.booking.findMany({ where: { orderId: scenario.orderId } });
    expect(bookings.every((b) => b.status === 'CONFIRMED')).toBe(true);
    const payments = await prisma.payment.findMany({ where: { bookingId: { in: scenario.bookingIds } } });
    expect(payments.every((p) => p.escrowStatus === 'HELD')).toBe(true);

    // 15% fee split with no rounding leak
    const { fee, payout } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);
    expect(fee + payout).toBe(2_000_000);
    expect(payments[0]!.platformFee).toBe(fee);
    expect(payments[0]!.usherPayout).toBe(payout);
  });

  it('full lifecycle: per-booking ledger sums to 0; wallet == Σ wallet_ledger', async () => {
    scenario = await createScenario({ headcount: 3, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_test_2'));

    for (const id of scenario.bookingIds) {
      await markCheckedIn(id);
      await prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP'));
    }

    for (const id of scenario.bookingIds) {
      expect(await bookingLedgerSum(id)).toBe(0); // HOLD − RELEASE − FEE == 0
      const b = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(b.status).toBe('PAID');
    }

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } });
    const walletSum = await prisma.walletLedger.aggregate({
      where: { walletId: scenario.walletId },
      _sum: { amount: true },
    });
    expect(wallet.availableBalance).toBe(walletSum._sum.amount ?? 0);
    // 3 × ₦17,000 payout (₦20,000 − 15%)
    const { payout } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);
    expect(wallet.availableBalance).toBe(payout * 3);
  });

  it('partial refund of a batch: one booking REFUNDED, others intact, order PARTIALLY_REFUNDED', async () => {
    scenario = await createScenario({ headcount: 3, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_test_3'));

    const [first, ...rest] = scenario.bookingIds;
    await prisma.$transaction(async (tx) => {
      await cancelBooking(tx, first!);
      await refundBooking(tx, first!, 2_000_000);
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe('PARTIALLY_REFUNDED');
    const refunded = await prisma.booking.findUniqueOrThrow({ where: { id: first! } });
    expect(refunded.status).toBe('REFUNDED');
    for (const id of rest) {
      const b = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(b.status).toBe('CONFIRMED'); // untouched
    }
  });

  it('rejects RELEASE on a frozen (disputed) booking', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_test_4'));
    const id = scenario.bookingIds[0]!;
    await prisma.$transaction((tx) => freezeBooking(tx, id));

    await expect(
      prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP')),
    ).rejects.toThrow(LedgerError);
  });

  it('withdrawal: debit then complete; failure reverses; no negative balance', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_test_5'));
    const id = scenario.bookingIds[0]!;
    await markCheckedIn(id);
    await prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP'));
    const bankId = await makeBankAccount(scenario.usherId);
    const { payout } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);

    // overdraw → rejected
    await expect(
      prisma.$transaction((tx) => requestWithdrawal(tx, scenario!.walletId, bankId, payout + 1)),
    ).rejects.toThrow(LedgerError);

    // valid withdrawal debits the wallet
    const wId = await prisma.$transaction((tx) =>
      requestWithdrawal(tx, scenario!.walletId, bankId, payout),
    );
    let wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } });
    expect(wallet.availableBalance).toBe(0);

    // transfer fails → reversal restores the balance (funds stay in wallet, §10)
    await prisma.$transaction((tx) => failWithdrawal(tx, wId));
    wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } });
    expect(wallet.availableBalance).toBe(payout);

    // a fresh, succeeding withdrawal
    const wId2 = await prisma.$transaction((tx) =>
      requestWithdrawal(tx, scenario!.walletId, bankId, payout),
    );
    await prisma.$transaction((tx) => completeWithdrawal(tx, wId2, 'trf_test'));
    const paid = await prisma.withdrawal.findUniqueOrThrow({ where: { id: wId2 } });
    expect(paid.status).toBe('PAID');
  });

  it('idempotency: replaying a hold produces exactly one effect', async () => {
    scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
    const key = `evt_${scenario.orderId}`;

    const first = await runIdempotent(prisma, key, 'paystack_event_id', (tx) =>
      holdOrder(tx, scenario!.orderId, 'chg_test_6'),
    );
    const second = await runIdempotent(prisma, key, 'paystack_event_id', (tx) =>
      holdOrder(tx, scenario!.orderId, 'chg_test_6'),
    );

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true); // short-circuited, no second hold

    const holdCount = await prisma.escrowLedger.count({
      where: { bookingId: { in: scenario.bookingIds }, entryType: 'HOLD' },
    });
    expect(holdCount).toBe(2); // one per booking, not doubled

    await prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
  });
});
