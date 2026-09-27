import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { env } from '../../../env.js';
import { jobCommissionSweep } from '../jobs.js';
import { commissionPeriod } from '../runtime.js';
import { holdOrder, markCheckedIn, releaseBooking } from '../../payments/ledger/ledger.js';
import { reconcile } from '../../payments/ledger/reconciliation.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';

const recipient = env.PAYSTACK_OPERATING_RECIPIENT;
let scenario: Scenario | undefined;
let period: string | undefined;
let sweepStart: Date | undefined;
afterEach(async () => {
  env.PAYSTACK_OPERATING_RECIPIENT = recipient;
  vi.restoreAllMocks();
  if (period) {
    await prisma.escrowLedger.deleteMany({
      where: { entryType: 'COMMISSION_SWEEP', bookingId: null, createdAt: { gte: sweepStart! } },
    });
    await prisma.paymentOperation.deleteMany({
      where: { dedupeKey: `COMMISSION_SWEEP:${period}` },
    });
  }
  if (scenario) await teardown(scenario);
  scenario = undefined;
  period = undefined;
});

async function release(id: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await markCheckedIn(tx, id, 'AUTO');
      await releaseBooking(tx, id, 'AUTO');
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}

describe('scheduled commission durable identity', () => {
  it('concurrent/repeated occurrences use one transfer and ledger entry even after more fees accrue', async () => {
    sweepStart = new Date();
    scenario = await createScenario({ headcount: 2, amountKobo: 200_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, `chg_${randomUUID()}`));
    await release(scenario.bookingIds[0]!);
    env.PAYSTACK_OPERATING_RECIPIENT = 'rcp_isolated_test';
    // Unique past scheduled day, deliberately different from the processing day.
    const scheduledAt = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 5000) * 86_400_000;
    period = commissionPeriod({
      timestamp: scheduledAt - 86_400_000,
      opts: { prevMillis: scheduledAt },
    });
    const paystack = new InMemoryPaystack();
    const transfer = vi.spyOn(paystack, 'transfer');
    const before = await reconcile(prisma, paystack);
    paystack.setBalanceKobo(before.expectedKobo);
    const deps = { prisma, paystack };
    await Promise.all([jobCommissionSweep(deps, period), jobCommissionSweep(deps, period)]);
    await release(scenario.bookingIds[1]!);
    await jobCommissionSweep(deps, period);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({ reference: `sweep_${period}` }),
    );
    const entries = await prisma.escrowLedger.findMany({
      where: { entryType: 'COMMISSION_SWEEP', bookingId: null, createdAt: { gte: sweepStart! } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount).toBe(-transfer.mock.calls[0]![0].amountKobo);
    expect(await reconcile(prisma, paystack)).toMatchObject({
      driftKobo: 0,
      expectedKobo: before.expectedKobo + entries[0]!.amount,
    });
    expect(
      await prisma.paymentOperation.findUniqueOrThrow({
        where: { dedupeKey: `COMMISSION_SWEEP:${period}` },
      }),
    ).toMatchObject({ status: 'RECORDED' });
  }, 300_000); // Multiple serialized ledger transactions over the remote validation DB.
});
