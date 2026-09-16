import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import { holdOrder, freezeBooking } from '../../payments/ledger/ledger.js';
import { resolveDispute, decideApproval } from '../service.js';
import { InMemoryPaystack } from '../../payments/port/paystack-port.js';
import { createScenario, teardown, type Scenario } from '../../payments/__tests__/fixtures.js';

let scenario: Scenario | null = null;
const adminIds: string[] = [];

async function makeAdmin(): Promise<string> {
  const u = await prisma.user.create({
    data: { role: 'ADMIN', phone: `+234777${Math.floor(Math.random() * 1e6)}`, status: 'ACTIVE' },
  });
  adminIds.push(u.id);
  return u.id;
}

async function setupDisputed(amountKobo: number): Promise<{ bookingId: string; disputeId: string; usherUserId: string }> {
  scenario = await createScenario({ headcount: 1, amountKobo });
  await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_admin'));
  const bookingId = scenario.bookingIds[0]!;
  await prisma.$transaction((tx) => freezeBooking(tx, bookingId));
  const dispute = await prisma.dispute.create({
    data: { bookingId, raisedById: scenario.clientUserId, reason: 'no-show', status: 'OPEN' },
  });
  return { bookingId, disputeId: dispute.id, usherUserId: scenario.usherUserId };
}

afterEach(async () => {
  if (scenario) {
    await prisma.approval.deleteMany({ where: { makerId: { in: adminIds } } });
    await prisma.dispute.deleteMany({ where: { bookingId: { in: scenario.bookingIds } } });
    await teardown(scenario);
  }
  await prisma.user.deleteMany({ where: { id: { in: adminIds } } });
  scenario = null;
  adminIds.length = 0;
});

describe('admin dispute resolution + maker-checker (TRD §15)', () => {
  it('below threshold: RELEASE executes immediately and pays the usher', async () => {
    const { bookingId, disputeId, usherUserId } = await setupDisputed(2_000_000); // ₦20k < ₦50k
    const admin = await makeAdmin();

    const out = await resolveDispute(admin, disputeId, 'RELEASE', 'usher attended', new InMemoryPaystack());
    expect(out.executed).toBe(true);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('PAID');
    const usher = await prisma.usher.findFirstOrThrow({ where: { userId: usherUserId }, include: { wallet: true } });
    expect(usher.wallet!.availableBalance).toBe(1_700_000); // ₦20k − 15%
    const dispute = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    expect(dispute.status).toBe('RESOLVED');
  });

  it('above threshold: needs a second admin; same-admin is rejected', async () => {
    const { bookingId, disputeId } = await setupDisputed(6_000_000); // ₦60k > ₦50k
    const maker = await makeAdmin();

    const paystack = new InMemoryPaystack();
    const out = await resolveDispute(maker, disputeId, 'RELEASE', 'usher attended', paystack);
    expect(out.executed).toBe(false);
    expect(out.approvalId).toBeTruthy();

    // maker cannot self-approve
    await expect(decideApproval(maker, out.approvalId!, 'approve', paystack)).rejects.toThrow(/checker must differ/i);

    // a different admin approves → executes
    const checker = await makeAdmin();
    await decideApproval(checker, out.approvalId!, 'approve', paystack);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('PAID');
    const approval = await prisma.approval.findUniqueOrThrow({ where: { id: out.approvalId! } });
    expect(approval.status).toBe('EXECUTED');
    expect(approval.checkerId).toBe(checker);
  });
});
