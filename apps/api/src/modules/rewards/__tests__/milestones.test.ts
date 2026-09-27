/**
 * Usher reward milestones — evaluated at the booking-completion chokepoint.
 * Driven through the ledger like the other payments suites (DB-backed, serial).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@hq/database';
import {
  holdOrder,
  releaseBooking,
  freezeBooking,
  resolveDisputeRelease,
} from '../../payments/ledger/ledger.js';
import { evaluateMilestones } from '../service.js';
import {
  createScenario,
  teardown,
  type Scenario,
  FIXTURE_DISPUTE_TIME,
} from '../../payments/__tests__/fixtures.js';

let scenario: Scenario | null = null;
let tierIds: string[] = [];

// Low thresholds (1/2/3) so a few completions cross every tier. Distinct from
// the seeded 20/50/150 tiers.
const THRESHOLDS = [1, 2, 3];

async function makeTiers(): Promise<{ badge: string; dress: string; phone: string }> {
  // Robust to leftovers from a crashed run.
  await prisma.usherMilestone.deleteMany({ where: { tier: { threshold: { in: THRESHOLDS } } } });
  await prisma.milestoneTier.deleteMany({ where: { threshold: { in: THRESHOLDS } } });
  const badge = await prisma.milestoneTier.create({
    data: { threshold: 1, name: 'T1 Badge', rewardType: 'BADGE' },
  });
  const dress = await prisma.milestoneTier.create({
    data: { threshold: 2, name: 'T2 Dress', rewardType: 'PHYSICAL' },
  });
  const phone = await prisma.milestoneTier.create({
    data: { threshold: 3, name: 'T3 iPhone', rewardType: 'PHYSICAL' },
  });
  tierIds = [badge.id, dress.id, phone.id];
  return { badge: badge.id, dress: dress.id, phone: phone.id };
}

async function complete(bookingId: string): Promise<void> {
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CHECKED_IN' } });
  await prisma.$transaction((tx) => releaseBooking(tx, bookingId, 'OTP'));
}

afterEach(async () => {
  if (scenario) await teardown(scenario); // cascade-deletes the usher's milestones
  scenario = null;
  if (tierIds.length) {
    await prisma.usherMilestone.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.milestoneTier.deleteMany({ where: { id: { in: tierIds } } });
    tierIds = [];
  }
});

describe('usher milestones', () => {
  it('unlocks tiers as completions cross thresholds; BADGE auto-fulfils, PHYSICAL waits', async () => {
    const { badge, dress } = await makeTiers();
    scenario = await createScenario({ headcount: 3, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_ms_1'));

    // 1st completion → count 1 → badge tier, auto-fulfilled
    await complete(scenario.bookingIds[0]!);
    let usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.completedJobsCount).toBe(1);
    let ms = await prisma.usherMilestone.findMany({ where: { usherId: scenario.usherId } });
    expect(ms).toHaveLength(1);
    expect(ms[0]!.tierId).toBe(badge);
    expect(ms[0]!.status).toBe('FULFILLED');
    expect(ms[0]!.fulfilledAt).not.toBeNull();

    // 2nd completion → count 2 → physical dress tier, left UNLOCKED for admin
    await complete(scenario.bookingIds[1]!);
    usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.completedJobsCount).toBe(2);
    const dressMs = await prisma.usherMilestone.findFirstOrThrow({
      where: { usherId: scenario.usherId, tierId: dress },
    });
    expect(dressMs.status).toBe('UNLOCKED');
    expect(dressMs.fulfilledAt).toBeNull();

    // 3rd completion → count 3 → all three tiers unlocked
    await complete(scenario.bookingIds[2]!);
    ms = await prisma.usherMilestone.findMany({ where: { usherId: scenario.usherId } });
    expect(ms).toHaveLength(3);
  });

  it('is idempotent: repeated evaluation never duplicates a tier unlock', async () => {
    await makeTiers();
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });

    // Evaluate 5 times directly. Count climbs to 5, but only the 3 reachable
    // tiers unlock, exactly once each (guarded by @@unique([usherId, tierId])).
    for (let i = 0; i < 5; i++) {
      await prisma.$transaction((tx) => evaluateMilestones(tx, scenario!.usherId));
    }
    const usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.completedJobsCount).toBe(5);
    const ms = await prisma.usherMilestone.findMany({ where: { usherId: scenario.usherId } });
    expect(ms).toHaveLength(3);
    expect(new Set(ms.map((m) => m.tierId)).size).toBe(3); // distinct tiers
  });

  it('the dispute-release completion path also unlocks milestones', async () => {
    const { badge } = await makeTiers();
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_ms_2'));
    const bookingId = scenario.bookingIds[0]!;
    await prisma.$transaction((tx) => freezeBooking(tx, bookingId, FIXTURE_DISPUTE_TIME)); // → DISPUTED
    await prisma.$transaction(async (tx) => {
      await resolveDisputeRelease(tx, bookingId); // admin restores completion
      await releaseBooking(tx, bookingId, 'AUTO'); // historical event is beyond its deadline
    });

    const usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.completedJobsCount).toBe(1);
    const ms = await prisma.usherMilestone.findMany({ where: { usherId: scenario.usherId } });
    expect(ms).toHaveLength(1);
    expect(ms[0]!.tierId).toBe(badge);
  });

  it('inactive tiers do not unlock', async () => {
    await makeTiers();
    await prisma.milestoneTier.updateMany({
      where: { id: { in: tierIds } },
      data: { active: false },
    });
    scenario = await createScenario({ headcount: 1, amountKobo: 2_000_000 });
    await prisma.$transaction((tx) => holdOrder(tx, scenario!.orderId, 'chg_ms_3'));
    await complete(scenario.bookingIds[0]!);

    const ms = await prisma.usherMilestone.findMany({ where: { usherId: scenario.usherId } });
    expect(ms).toHaveLength(0);
    const usher = await prisma.usher.findUniqueOrThrow({ where: { id: scenario.usherId } });
    expect(usher.completedJobsCount).toBe(1); // count still tracks
  });
});
