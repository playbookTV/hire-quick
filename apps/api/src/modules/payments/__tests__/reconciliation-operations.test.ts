import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@hq/database';
import { reconcile, recordReconciliation } from '../ledger/reconciliation.js';
import { holdOrder, freezeBooking } from '../ledger/ledger.js';
import { InMemoryPaystack } from '../port/paystack-port.js';
import { createScenario, teardown, type Scenario } from './fixtures.js';
import { jobReconcile } from '../../jobs/jobs.js';
import { noopGateway } from '../../../realtime/gateway.js';
let scenario: Scenario | undefined;
afterEach(async () => {
  if (scenario) await teardown(scenario);
  scenario = undefined;
});
describe('durable reconciliation evidence', () => {
  it('records and emits a one-kobo drift with snapshot evidence', async () => {
    const paystack = new InMemoryPaystack();
    const probe = await reconcile(prisma, paystack);
    paystack.setBalanceKobo(probe.expectedKobo + 1);
    const emitToAdmins = vi.fn();
    await jobReconcile({ prisma, paystack }, { ...noopGateway, emitToAdmins });
    expect(emitToAdmins).toHaveBeenCalledWith(
      'recon:alarm',
      expect.objectContaining({ driftKobo: 1, classification: 'drift' }),
    );
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'reconciliation.run' },
      orderBy: { seq: 'desc' },
    });
    expect(row.metadata).toMatchObject({
      driftKobo: 1,
      evidence: {
        before: { expectedKobo: probe.expectedKobo },
        after: { expectedKobo: probe.expectedKobo },
      },
    });
  });
  it('flags aged frozen funds and persists failed provider reads', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 10000 });
    await prisma.$transaction(async (tx) => {
      await holdOrder(tx, scenario!.orderId, 'recon-frozen');
      await freezeBooking(tx, scenario!.bookingIds[0]!);
    });
    await prisma.payment.updateMany({
      where: { bookingId: { in: scenario.bookingIds } },
      data: { createdAt: new Date('2000-01-01') },
    });
    const paystack = new InMemoryPaystack();
    const probe = await reconcile(prisma, paystack);
    paystack.setBalanceKobo(probe.expectedKobo);
    expect(await reconcile(prisma, paystack)).toMatchObject({
      ok: false,
      classification: 'review',
      staleFrozenBookingIds: scenario.bookingIds,
    });
    vi.spyOn(paystack, 'getBalanceKobo').mockRejectedValue(new Error('private-provider-detail'));
    await expect(recordReconciliation(prisma, paystack)).rejects.toThrow();
    const failure = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'reconciliation.error' },
      orderBy: { seq: 'desc' },
    });
    expect(JSON.stringify(failure.metadata)).not.toContain('private-provider-detail');
  });
  it('does not call a concurrent settlement a clean snapshot', async () => {
    scenario = await createScenario({ headcount: 1, amountKobo: 10000 });
    const paystack = new InMemoryPaystack();
    vi.spyOn(paystack, 'getBalanceKobo').mockImplementation(async () => {
      await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'during-recon'));
      return 10000;
    });
    expect(await reconcile(prisma, paystack)).toMatchObject({
      ok: false,
      snapshotChanged: true,
      classification: 'in_flight',
    });
  });
});
