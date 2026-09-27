import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { cancelWindow, eventInstant } from '@hq/shared';
import * as audit from '../../audit.js';
import { assertArrival, noShowSweep } from '../../bookings/service.js';
import { cancelConfirmedBooking } from '../cancellation.js';
import { driveRefund } from '../service.js';
import { holdOrder } from '../ledger/ledger.js';
import { pendingEarningsByBooking } from '../pending-earnings.js';
import { InMemoryPaystack, type PaystackPort } from '../port/paystack-port.js';
import { bookingLedgerSum, createScenario, teardown, type Scenario } from './fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  vi.restoreAllMocks();
  if (scenario) await teardown(scenario);
  scenario = null;
});
async function setup() {
  scenario = await createScenario({ amountKobo: 10_001 });
  // Tomorrow at 23:00 Lagos is always in the inclusive 12–48-hour window.
  const eventDate = new Date(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  await prisma.event.update({
    where: { id: scenario.eventId },
    data: { eventDate, startTime: '23:00', endTime: '23:59' },
  });
  await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, `test-${scenario!.orderId}`), {
    timeout: 30_000,
  });
  const paystack: PaystackPort = new InMemoryPaystack();
  return {
    ...scenario,
    bookingId: scenario.bookingIds[0]!,
    deps: { prisma, paystack },
    confirmation: {
      expectedWindow: cancelWindow(eventInstant(eventDate, '23:00'), new Date()),
      expectedRefundKobo: 5000,
    },
  };
}

describe('cancellation recovery checkpoints', () => {
  it('concurrent requests share one refund dispatch and one credit', async () => {
    const s = await setup();
    const refund = vi.spyOn(s.deps.paystack, 'refund');
    const requests = await Promise.all(
      [1, 2].map(() => cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, s.confirmation)),
    );
    expect(requests[0]!.operationId).toBe(requests[1]!.operationId);
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: requests[0]!.operationId },
    });
    expect((await driveRefund(s.deps, op, true)).status).toBe('RECORDED');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(
      await prisma.walletLedger.count({ where: { bookingId: s.bookingId, entryType: 'CREDIT' } }),
    ).toBe(1);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
    ).toBe(4251);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
  }, 120_000);

  it('provider failure leaves the allocation held and never silently reissues', async () => {
    const s = await setup();
    const refund = vi.spyOn(s.deps.paystack, 'refund').mockResolvedValue({ status: 'failed' });
    const result = await cancelConfirmedBooking(
      s.deps,
      s.bookingId,
      s.clientUserId,
      s.confirmation,
    );
    expect(result.status).toBe('FAILED');
    await expect(
      cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, s.confirmation),
    ).rejects.toMatchObject({ code: 'CANCELLATION_FAILED' });
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: result.operationId },
    });
    expect((await driveRefund(s.deps, op)).status).toBe('FAILED');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await bookingLedgerSum(s.bookingId)).toBe(10_001);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
    ).toBe(0);
    expect(
      (await pendingEarningsByBooking(prisma, [{ bookingId: s.bookingId, usherPayout: 8501 }])).get(
        s.bookingId,
      ),
    ).toBe(8501);
  }, 120_000);

  it('audit failure rolls back the entire split while preserving provider success for recovery', async () => {
    const s = await setup();
    const refund = vi.spyOn(s.deps.paystack, 'refund');
    const actualAudit = audit.writeAudit;
    const write = vi.spyOn(audit, 'writeAudit').mockImplementation(async (entry, tx) => {
      if (entry.action === 'booking.cancellation.settled') throw new Error('audit unavailable');
      return actualAudit(entry, tx);
    });
    await expect(
      cancelConfirmedBooking(s.deps, s.bookingId, s.clientUserId, s.confirmation),
    ).rejects.toThrow('audit unavailable');
    const op = await prisma.paymentOperation.findUniqueOrThrow({
      where: { dedupeKey: `BOOKING_REFUND:${s.bookingId}` },
    });
    expect(op.status).toBe('PROVIDER_OK');
    await expect(assertArrival(s.bookingId, s.usherUserId)).rejects.toMatchObject({
      code: 'REFUND_PENDING',
    });
    const swept = await noShowSweep(s.deps, new Date(Date.now() + 2 * 86_400_000));
    expect(swept.noShows).not.toContain(s.bookingId);
    expect(swept.noShows).toEqual(expect.arrayContaining(s.bookingIds.slice(1)));
    expect(await bookingLedgerSum(s.bookingId)).toBe(10_001);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
    ).toBe(0);
    expect(
      (await pendingEarningsByBooking(prisma, [{ bookingId: s.bookingId, usherPayout: 8501 }])).get(
        s.bookingId,
      ),
    ).toBe(4251);
    write.mockRestore();
    expect((await driveRefund(s.deps, op, true)).status).toBe('RECORDED');
    expect(
      refund.mock.calls.filter(([r]) => r.reference === `BOOKING_REFUND:${s.bookingId}`),
    ).toHaveLength(1);
    // Each unrelated sibling has its own legitimate no-show refund.
    expect(refund).toHaveBeenCalledTimes(s.bookingIds.length);
    expect(await bookingLedgerSum(s.bookingId)).toBe(0);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { id: s.walletId } })).availableBalance,
    ).toBe(4251);
    expect(
      await prisma.auditLog.count({
        where: { target: s.bookingId, action: 'booking.cancellation.settled' },
      }),
    ).toBe(1);
  }, 120_000);
});
