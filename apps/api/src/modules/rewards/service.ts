/**
 * Usher reward milestones (loyalty). Evaluated at the single booking-completion
 * chokepoint in the ledger, so every completion path (manual complete,
 * auto-complete sweep, dispute-release) is covered atomically. This module owns
 * all writes to milestone_tiers / usher_milestones and the usher rank counter —
 * the ledger only invokes evaluateMilestones() inside its transaction, keeping
 * ledger.ts limited to escrow/wallet writes.
 */
import type { MilestoneTier, Prisma } from '@hq/database';

type Tx = Prisma.TransactionClient;

/**
 * Bump the usher's lifetime completed-job count and unlock any tier it now
 * reaches. BADGE rewards auto-fulfil on unlock; PHYSICAL rewards (dress, iPhone)
 * stay UNLOCKED until an admin fulfils them. Idempotent and race-safe via the
 * @@unique([usherId, tierId]) constraint + skipDuplicates. Returns the tiers
 * unlocked by THIS call so the caller can fire a best-effort notification.
 */
export async function evaluateMilestones(tx: Tx, usherId: string): Promise<MilestoneTier[]> {
  const usher = await tx.usher.update({
    where: { id: usherId },
    data: { completedJobsCount: { increment: 1 } },
    select: { completedJobsCount: true },
  });

  const eligible = await tx.milestoneTier.findMany({
    where: { active: true, threshold: { lte: usher.completedJobsCount } },
  });
  if (eligible.length === 0) return [];

  const already = await tx.usherMilestone.findMany({
    where: { usherId, tierId: { in: eligible.map((t) => t.id) } },
    select: { tierId: true },
  });
  const have = new Set(already.map((m) => m.tierId));
  const fresh = eligible.filter((t) => !have.has(t.id));
  if (fresh.length === 0) return [];

  const now = new Date();
  await tx.usherMilestone.createMany({
    data: fresh.map((t) => ({
      usherId,
      tierId: t.id,
      status: t.rewardType === 'BADGE' ? ('FULFILLED' as const) : ('UNLOCKED' as const),
      fulfilledAt: t.rewardType === 'BADGE' ? now : null,
    })),
    skipDuplicates: true,
  });
  return fresh;
}
