import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { splitFee, PLATFORM_FEE_BPS } from '@hq/shared';
import { holdOrder, releaseBooking } from '../../payments/ledger/ledger.js';
import { commissionSweepAmount, runCommissionSweep } from '../../payments/service.js';
import { noShowSweep } from '../../bookings/service.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  await prisma.escrowLedger.deleteMany({ where: { entryType: 'COMMISSION_SWEEP' } });
  scenario = null;
});

describe('scheduled jobs (TRD §17, D1/D3)', () => {
  it('no-show sweep: confirmed + unverified past start+grace → NO_SHOW refunded', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_noshow'));
    // move the event into the past so start + grace has elapsed
    await prisma.event.update({
      where: { id: scenario.eventId },
      data: { eventDate: new Date('2020-01-01'), startTime: '10:00', endTime: '18:00' },
    });

    const { noShows } = await noShowSweep(new Date());
    expect(noShows).toContain(scenario.bookingIds[0]);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: scenario.bookingIds[0]! },
      include: { payment: true },
    });
    expect(booking.status).toBe('REFUNDED');
    expect(booking.payment?.escrowStatus).toBe('REFUNDED');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
    expect(order.status).toBe('REFUNDED');
    const usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.reliabilityScore).toBeLessThan(100); // penalised
  });

  it('commission sweep: accumulated fees are swept and recorded (D3)', async () => {
    scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_sweep'));

    const before = await commissionSweepAmount(prisma);
    for (const id of scenario.bookingIds) {
      await prisma.booking.update({ where: { id }, data: { status: 'CHECKED_IN' } });
      await prisma.$transaction((tx) => releaseBooking(tx, id, 'OTP'));
    }
    const { fee } = splitFee(2_000_000 as never, PLATFORM_FEE_BPS);
    const mid = await commissionSweepAmount(prisma);
    expect(mid - before).toBe(fee * 2); // two bookings' fees accrued

    const deps = { prisma, paystack: new InMemoryPaystack() };
    const { swept } = await runCommissionSweep(deps, { operatingRecipientCode: 'rcp_ops' });
    expect(swept).toBe(mid);

    const after = await commissionSweepAmount(prisma);
    expect(after).toBe(0);
    const sweepEntry = await prisma.escrowLedger.findFirst({
      where: { entryType: 'COMMISSION_SWEEP' },
      orderBy: { createdAt: 'desc' },
    });
    expect(sweepEntry?.amount).toBe(-swept);
  });
});
