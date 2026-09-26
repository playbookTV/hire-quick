import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import { kobo, priceBooking, cancellationSettlement, policyForCancellation } from '@hq/shared';
import { holdOrder, releaseBooking, markCheckedIn } from '../ledger/ledger.js';
import { cancelConfirmedBooking } from '../cancellation.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, bookingLedgerSum, type Scenario } from './fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});
const TX = { timeout: 30_000, maxWait: 30_000 };
async function setup(base = 1_000_000) {
  const price = priceBooking(kobo(base));
  scenario = await createScenario({ headcount: 1, amountKobo: price.gross });
  await prisma.booking.update({ where: { id: scenario.bookingIds[0]! }, data: { staffPay: base } });
  await prisma.event.update({ where: { id: scenario.eventId }, data: { budgetPerHead: base } });
  await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, `fee-test-${scenario!.orderId}`), TX);
  return { ...scenario, bookingId: scenario.bookingIds[0]!, price };
}

describe('client-paid platform fee ledger', () => {
  it('holds the added fee and credits the full agreed pay exactly once', async () => {
    const s = await setup();
    expect(await bookingLedgerSum(s.bookingId)).toBe(1_150_000);
    expect(await prisma.payment.findUniqueOrThrow({ where: { bookingId: s.bookingId } })).toMatchObject({
      grossAmount: 1_150_000, usherPayout: 1_000_000, platformFee: 150_000,
    });
    await prisma.$transaction((tx) => markCheckedIn(tx, s.bookingId, 'OTP'), TX);
    await prisma.$transaction((tx) => releaseBooking(tx, s.bookingId, 'OTP'), TX);
    await expect(prisma.$transaction((tx) => releaseBooking(tx, s.bookingId, 'OTP'), TX)).rejects.toThrow();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(1_000_000);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
  });
  it.each([
    ['GT_48H', '2099-01-01', 1_150_000, 0, 0],
    ['BETWEEN_12_48H', 'tomorrow', 575_000, 500_000, 75_000],
    ['LT_12H', '2026-09-01', 0, 1_000_000, 150_000],
  ] as const)('settles %s proportionally without duplicate refunds or credits', async (window, date, refund, payout, fee) => {
    const s = await setup();
    const eventDate = date === 'tomorrow'
      ? new Date(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
      : new Date(date);
    await prisma.event.update({ where: { id: s.eventId }, data: { eventDate, startTime: '23:59' } });
    const provider = new InMemoryPaystack();
    const quote = cancellationSettlement(s.price.gross, policyForCancellation('CLIENT', window), 1_000_000);
    const confirmation = { expectedWindow: window, expectedRefundKobo: quote.refundKobo };
    const result = await cancelConfirmedBooking({ prisma, paystack: provider }, s.bookingId, s.clientUserId, confirmation);
    expect(result.status).toBe('RECORDED');
    expect(result.settlement).toMatchObject({ policy: 'CLIENT_CANCEL_V2', refundKobo: refund, usherPayoutKobo: payout, platformFeeKobo: fee });
    await cancelConfirmedBooking({ prisma, paystack: provider }, s.bookingId, s.clientUserId, confirmation);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance).toBe(payout);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
    expect(await prisma.walletLedger.count({ where: { bookingId: s.bookingId, entryType: 'CREDIT' } })).toBe(payout > 0 ? 1 : 0);
  });
});
