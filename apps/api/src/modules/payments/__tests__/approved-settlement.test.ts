import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import {
  bookingReleaseAt,
  cancelWindow,
  cancellationSettlement,
  eventInstant,
  policyForCancellation,
} from '@hq/shared';
import {
  completeBookingHeld,
  freezeBooking,
  holdOrder,
  markCheckedIn,
  releaseBooking,
  requestWithdrawal,
} from '../ledger/ledger.js';
import { cancelConfirmedBooking } from '../cancellation.js';
import { driveRefund, refundBookingToClient } from '../service.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { autoComplete, completeBooking, openDispute } from '../../bookings/service.js';
import {
  decideApproval,
  executeApprovalOp,
  proposeCancellation,
  resolveDispute,
} from '../../admin/service.js';
import { bookingLedgerSum, createScenario, teardown, type Scenario } from './fixtures.js';

const TX = { timeout: 30_000, maxWait: 30_000 };
let scenario: Scenario | null = null;
const admins: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  if (scenario) {
    const approvals = await prisma.approval.findMany({
      where: { makerId: { in: admins } },
      select: { id: true },
    });
    await prisma.paymentOperation.deleteMany({
      where: { dedupeKey: { in: approvals.map((a) => `APPROVAL_EXECUTE:${a.id}`) } },
    });
    await prisma.approval.deleteMany({ where: { makerId: { in: admins } } });
    await prisma.dispute.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
  }
  await prisma.user.deleteMany({ where: { id: { in: admins } } });
  scenario = null;
  admins.length = 0;
});
async function setup(amountKobo = 10_001, days = 1, headcount = 1) {
  scenario = await createScenario({ amountKobo, headcount });
  const eventDate = new Date(new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10));
  const startTime = days === 1 ? '23:00' : '10:00';
  const endTime = days === 1 ? '23:59' : '18:00';
  await prisma.event.update({
    where: { id: scenario.eventId },
    data: { eventDate, startTime, endTime },
  });
  await prisma.$transaction(
    (tx) => holdOrder(tx, scenario!.orderId, `test-charge-${scenario!.orderId}`),
    TX,
  );
  const provider = new InMemoryPaystack();
  const start = eventInstant(eventDate, startTime);
  const window = cancelWindow(start, new Date());
  const quote = cancellationSettlement(amountKobo, policyForCancellation('CLIENT', window));
  return {
    ...scenario,
    bookingId: scenario.bookingIds[0]!,
    provider,
    deps: { prisma, paystack: provider },
    eventDate,
    deadline: bookingReleaseAt(eventDate, endTime),
    confirmation: { expectedWindow: window, expectedRefundKobo: quote.refundKobo },
    quote,
  };
}
async function admin() {
  const user = await prisma.user.create({
    data: { role: 'ADMIN', status: 'ACTIVE', phone: `+234-test-${randomUUID()}` },
  });
  admins.push(user.id);
  return user.id;
}
async function balance(walletId: string) {
  return (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).availableBalance;
}

describe('held completion and approved cancellation settlement', () => {
  it('completion retains escrow, allows an in-window dispute, and early admin resolution cannot withdraw funds', async () => {
    const s = await setup(10_001, -1);
    await prisma.$transaction((tx) => markCheckedIn(tx, s.bookingId, 'OTP'), TX);
    expect(await completeBooking(s.bookingId, s.clientUserId)).toEqual({ status: 'COMPLETED' });
    expect(await balance(s.walletId)).toBe(0);
    expect(await bookingLedgerSum(s.bookingId)).toBe(10_001);
    const d = await openDispute(s.bookingId, s.clientUserId, 'Work quality');
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { bookingId: s.bookingId } })).escrowStatus,
    ).toBe('FROZEN');
    await resolveDispute(await admin(), d.id, 'RELEASE', 'Attendance confirmed', s.provider);
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: s.bookingId },
      include: { payment: true },
    });
    expect(b.status).toBe('COMPLETED');
    expect(b.payment!.escrowStatus).toBe('HELD');
    expect(await balance(s.walletId)).toBe(0);
    const bank = await prisma.bankAccount.create({
      data: {
        usherId: s.usherId,
        accountName: 'Test',
        bankCode: '058',
        accountNumber: '0000000000',
        verified: true,
      },
    });
    await expect(
      prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, 1), TX),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    await autoComplete(s.deadline);
    await autoComplete(new Date(+s.deadline + 1));
    expect(await balance(s.walletId)).toBe(8501);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
    expect(
      await prisma.walletLedger.count({ where: { bookingId: s.bookingId, entryType: 'CREDIT' } }),
    ).toBe(1);
    await prisma.$transaction((tx) => requestWithdrawal(tx, s.walletId, bank.id, 8501), TX);
    expect(await completeBooking(s.bookingId, s.clientUserId)).toEqual({ status: 'PAID' });
    expect(await balance(s.walletId)).toBe(0);
    await expect(openDispute(s.bookingId, s.clientUserId, 'Again')).rejects.toMatchObject({
      code: 'NOT_DISPUTABLE',
    });
  }, 120_000);

  it('auto-completes at grace, but releases only at the 72-hour boundary', async () => {
    const s = await setup(10_001, -1);
    await prisma.booking.update({
      where: { id: s.bookingId },
      data: { arrivalAssertedAt: new Date() },
    });
    const grace = new Date(+eventInstant(s.eventDate, '18:00') + 3_600_000);
    expect((await autoComplete(grace)).completed).toContain(s.bookingId);
    expect(await balance(s.walletId)).toBe(0);
    await expect(
      prisma.$transaction(
        (tx) => releaseBooking(tx, s.bookingId, 'AUTO', new Date(+s.deadline - 1)),
        TX,
      ),
    ).rejects.toMatchObject({ code: 'DISPUTE_WINDOW_OPEN' });
    await prisma.$transaction((tx) => releaseBooking(tx, s.bookingId, 'AUTO', s.deadline), TX);
    await expect(
      prisma.$transaction((tx) => freezeBooking(tx, s.bookingId, new Date(+s.deadline + 1)), TX),
    ).rejects.toMatchObject({ code: 'NOT_DISPUTABLE' });
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
  }, 120_000);

  it('serializes competing dispute and release at the deadline and never moves frozen funds', async () => {
    const s = await setup(10_001, -1);
    await prisma.$transaction(async (tx) => {
      await markCheckedIn(tx, s.bookingId, 'OTP');
      await completeBookingHeld(tx, s.bookingId, 'OTP');
    }, TX);
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => freezeBooking(tx, s.bookingId, s.deadline), TX),
      prisma.$transaction((tx) => releaseBooking(tx, s.bookingId, 'OTP', s.deadline), TX),
    ]);
    expect(results[0].status).toBe('rejected');
    if (results[0].status === 'rejected')
      expect(['DISPUTE_WINDOW_CLOSED', 'NOT_DISPUTABLE']).toContain(
        (results[0].reason as { code: string }).code,
      );
    expect(results[1].status).toBe('fulfilled');
    expect(await balance(s.walletId)).toBe(8501);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
  }, 120_000);

  it('a dispute admitted just before the deadline blocks a later release', async () => {
    const s = await setup(10_001, -1);
    await prisma.$transaction(async (tx) => {
      await markCheckedIn(tx, s.bookingId, 'OTP');
      await completeBookingHeld(tx, s.bookingId, 'OTP');
    }, TX);
    await prisma.$transaction(
      (tx) => freezeBooking(tx, s.bookingId, new Date(+s.deadline - 1)),
      TX,
    );
    await expect(
      prisma.$transaction((tx) => releaseBooking(tx, s.bookingId, 'OTP', s.deadline), TX),
    ).rejects.toMatchObject({ code: 'FROZEN' });
    expect(await balance(s.walletId)).toBe(0);
    expect(await bookingLedgerSum(s.bookingId)).toBe(10_001);
  });

  it.each([3, 1, -1])(
    'settles the window %i days from start once, conserving odd kobo and leaving siblings untouched',
    async (days) => {
      const s = await setup(10_001, days, 2);
      const refund = vi.spyOn(s.provider, 'refund');
      const first = await cancelConfirmedBooking(
        s.deps,
        s.bookingId,
        s.clientUserId,
        s.confirmation,
      );
      const replay = await cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, {
        expectedWindow: 'GT_48H',
        expectedRefundKobo: 999,
      });
      expect(first.status).toBe('RECORDED');
      expect(replay.operationId).toBe(first.operationId);
      expect(first.settlement).toMatchObject(s.quote);
      expect(refund).toHaveBeenCalledTimes(s.quote.refundKobo > 0 ? 1 : 0);
      expect(await balance(s.walletId)).toBe(s.quote.usherPayoutKobo);
      expect(await bookingLedgerSum(s.bookingId)).toBe(0);
      expect(await bookingLedgerSum(s.bookingIds[1]!)).toBe(10_001);
      const entries = await prisma.escrowLedger.findMany({
        where: { bookingId: s.bookingId, entryType: { not: 'HOLD' } },
      });
      expect(entries.reduce((sum, e) => sum - e.amount, 0)).toBe(10_001);
      expect(new Set(entries.map((e) => e.entryType)).size).toBe(entries.length);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: s.bookingId } })).status).toBe(
        s.quote.usherCompensationKobo ? 'CANCELLED' : 'REFUNDED',
      );
    },
    120_000,
  );

  it('rejects stale/unconfirmed late quotes and non-owners without reserving or dispatching', async () => {
    const s = await setup();
    const refund = vi.spyOn(s.provider, 'refund');
    await expect(
      cancelConfirmedBooking(s.deps, s.bookingId, s.usherUserId, s.confirmation),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId)).rejects.toMatchObject(
      { code: 'CANCELLATION_QUOTE_REQUIRED' },
    );
    await expect(
      cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, {
        expectedWindow: 'GT_48H',
        expectedRefundKobo: s.amountKobo,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLATION_QUOTE_CHANGED' });
    expect(refund).not.toHaveBeenCalled();
    expect(
      await prisma.paymentOperation.count({
        where: { dedupeKey: `BOOKING_REFUND:${s.bookingId}` },
      }),
    ).toBe(0);
    expect(await bookingLedgerSum(s.bookingId)).toBe(s.amountKobo);
  }, 120_000);

  it('retains an uncertain refund reservation and finalizes read-only evidence without a second POST', async () => {
    const s = await setup();
    const actualRefund = s.provider.refund.bind(s.provider);
    const refund = vi.spyOn(s.provider, 'refund').mockImplementation(async (p) => {
      await actualRefund(p);
      throw new Error('response lost');
    });
    const first = await cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, s.confirmation);
    expect(first.status).toBe('PROCESSING');
    expect(await balance(s.walletId)).toBe(0);
    await expect(
      prisma.$transaction((tx) => markCheckedIn(tx, s.bookingId, 'OTP'), TX),
    ).rejects.toMatchObject({ code: 'REFUND_PENDING' });
    await expect(
      refundBookingToClient(s.deps, {
        bookingId: s.bookingId,
        amountKobo: s.amountKobo,
        precursor: 'CANCEL',
      }),
    ).rejects.toMatchObject({ code: 'REFUND_CONFLICT' });
    const operation = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: first.operationId },
    });
    expect((await driveRefund(s.deps, operation, true)).status).toBe('RECORDED');
    expect((await driveRefund(s.deps, operation, true)).status).toBe('RECORDED');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
    expect(await balance(s.walletId)).toBe(s.quote.usherPayoutKobo);
  }, 120_000);

  it('keeps above-threshold cancellation reserved through rejection, distinct-admin approval and delayed replay', async () => {
    const s = await setup(6_000_001);
    const refund = vi.spyOn(s.provider, 'refund');
    const requested = await cancelConfirmedBooking(
      s.deps,
      s.bookingId,
      s.clientUserId,
      s.confirmation,
    );
    expect(requested.status).toBe('AWAITING_APPROVAL');
    expect(refund).not.toHaveBeenCalled();
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: requested.operationId },
    });
    expect(op.quarantinedAt).not.toBeNull();
    expect((await driveRefund(s.deps, op)).status).toBe('PENDING');
    expect(refund).not.toHaveBeenCalled();
    const maker = await admin(),
      checker = await admin();
    const proposed = await proposeCancellation(maker, s.bookingId, 'Reviewed client cancellation');
    expect((await proposeCancellation(maker, s.bookingId, 'Repeated proposal')).approvalId).toBe(
      proposed.approvalId,
    );
    await expect(
      decideApproval(maker, proposed.approvalId, 'approve', s.provider),
    ).rejects.toMatchObject({ code: 'SAME_ADMIN' });
    await decideApproval(checker, proposed.approvalId, 'reject', s.provider);
    expect((await driveRefund(s.deps, op)).status).toBe('PENDING');
    expect(refund).not.toHaveBeenCalled();
    const revised = await proposeCancellation(maker, s.bookingId, 'Reviewed again');
    // A later event edit must not recompute an already confirmed quote.
    await prisma.event.update({
      where: { id: s.eventId },
      data: { eventDate: new Date('2020-01-01') },
    });
    await decideApproval(checker, revised.approvalId, 'approve', s.provider);
    const approval = await prisma.approval.findUniqueOrThrow({ where: { id: revised.approvalId } });
    expect(approval.status).toBe('EXECUTED');
    await executeApprovalOp(approval, s.provider);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0]![0].amountKobo).toBe(s.quote.refundKobo);
    expect(await balance(s.walletId)).toBe(s.quote.usherPayoutKobo);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
    expect(
      (await prisma.paymentOperation.findUniqueOrThrow({ where: { id: op.id } })).quarantinedAt,
    ).toBeNull();
  }, 180_000);
});
