import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import { holdOrder, releaseBooking, requestWithdrawal, LedgerError } from '../ledger/ledger.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});

describe('ledger concurrency (TRD §25 — proves SELECT … FOR UPDATE)', () => {
  it('two parallel withdrawals of the same balance: exactly one succeeds', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_conc'));
    const id = scenario.bookingIds[0]!;
    await prisma.booking.update({ where: { id }, data: { status: 'CHECKED_IN' } });
    await prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP'));

    const { payout } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);
    const bank = await prisma.bankAccount.create({
      data: { usherId: scenario.usherId, bankCode: '058', accountNumber: '0', accountName: 'T', verified: true },
    });

    // Fire both withdrawals of the FULL balance at once. The wallet row lock
    // serialises them; the loser sees a zero balance and is rejected.
    const txOpts = { timeout: 30_000, maxWait: 30_000 };
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => requestWithdrawal(tx, scenario!.walletId, bank.id, payout), txOpts),
      prisma.$transaction((tx) => requestWithdrawal(tx, scenario!.walletId, bank.id, payout), txOpts),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(LedgerError);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.walletId } });
    expect(wallet.availableBalance).toBe(0); // exactly one debit, never negative
  });
});
