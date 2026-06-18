import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { holdOrder } from '../ledger/ledger.js';
import { reconcile } from '../ledger/reconciliation.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';

let scenario: Scenario | null = null;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = null;
});

describe('reconciliation (TRD §17/§25)', () => {
  it('drift between ledger and Paystack balance raises the alarm', async () => {
    scenario = await createScenario({ headcount: 2, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_recon'));

    const paystack = new InMemoryPaystack();

    // Set the fake balance to the ledger-derived expected → no drift, no alarm.
    const probe = await reconcile(prisma, paystack);
    paystack.setBalanceKobo(probe.expectedKobo);
    const clean = await reconcile(prisma, paystack);
    expect(clean.driftKobo).toBe(0);
    expect(clean.ok).toBe(true);

    // Perturb the balance → drift detected, alarm raised.
    paystack.setBalanceKobo(probe.expectedKobo - 5_000);
    const drifted = await reconcile(prisma, paystack);
    expect(drifted.driftKobo).toBe(-5_000);
    expect(drifted.ok).toBe(false);
  });

  it('a HELD allocation nearing the 90-day rule raises the alarm even with no drift', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_recon_stale'));

    // Backdate the payment so it looks ~100 days old.
    const old = new Date(Date.now() - 100 * 86_400_000);
    await prisma.payment.updateMany({
      where: { bookingId: { in: scenario.bookingIds } },
      data: { createdAt: old },
    });

    const paystack = new InMemoryPaystack();
    const probe = await reconcile(prisma, paystack);
    paystack.setBalanceKobo(probe.expectedKobo); // zero drift…

    const result = await reconcile(prisma, paystack);
    expect(result.driftKobo).toBe(0);
    expect(result.staleHeldBookingIds.length).toBeGreaterThan(0); // …but stale HELD
    expect(result.ok).toBe(false);
  });
});
