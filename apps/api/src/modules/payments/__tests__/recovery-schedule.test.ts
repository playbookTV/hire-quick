import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@hq/database';
import {
  claimRecoveryBatch,
  recoveryDelay,
  reviewRecovery,
  MAX_RECOVERY_ATTEMPTS,
} from '../recovery-schedule.js';
const ids: string[] = [];
afterEach(async () => {
  await prisma.paymentOperation.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});
async function create(attempts = 1, recoveryAttempts = 0) {
  const id = randomUUID();
  ids.push(id);
  return prisma.paymentOperation.create({
    data: {
      id,
      kind: 'BOOKING_REFUND',
      dedupeKey: `recovery-test:${id}`,
      attempts,
      recoveryAttempts,
      payload: { bookingId: randomUUID() },
      updatedAt: new Date('2000-01-01'),
    },
  });
}
describe('payment recovery scheduling', () => {
  it('bounds backoff and quarantines the final automatic attempt', async () => {
    expect(recoveryDelay(1)).toBe(300_000);
    expect(recoveryDelay(50)).toBe(21_600_000);
    const op = await create(1, MAX_RECOVERY_ATTEMPTS - 1);
    const [claimed] = (await claimRecoveryBatch(prisma)).filter((row) => row.id === op.id);
    expect(claimed?.quarantinedAt).not.toBeNull();
    expect(claimed?.attempts).toBe(1);
    expect(
      (await claimRecoveryBatch(prisma, new Date('2100-01-01'))).map((row) => row.id),
    ).not.toContain(op.id);
  });
  it('operation 101 progresses even when the first 100 all fail before touching the operation', async () => {
    // No provider work follows the first claim: models an exception or worker crash.
    const batchIds = Array.from({ length: 101 }, () => randomUUID());
    ids.push(...batchIds);
    await prisma.paymentOperation.createMany({
      data: batchIds.map((id) => ({
        id,
        kind: 'BOOKING_REFUND',
        dedupeKey: `recovery-test:${id}`,
        attempts: 1,
        payload: { bookingId: randomUUID() },
        updatedAt: new Date('2000-01-01'),
      })),
    });
    const now = new Date();
    const first = await claimRecoveryBatch(prisma, now);
    expect(first).toHaveLength(100);
    const second = await claimRecoveryBatch(prisma, now);
    expect(second).toHaveLength(1);
    expect(first.map((row) => row.id)).not.toContain(second[0]!.id);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(101);
  });
  it('persists the exact bounded backoff for a mixed batch without resetting dispatch attempts', async () => {
    const priorAttempts = [0, 1, 3, 6, MAX_RECOVERY_ATTEMPTS - 1];
    const rows = [];
    for (const attempts of priorAttempts) rows.push(await create(3, attempts));
    const now = new Date();
    const claimed = await claimRecoveryBatch(prisma, now);
    for (const row of rows) {
      const saved = claimed.find((op) => op.id === row.id)!;
      expect(saved.recoveryAttempts).toBe(row.recoveryAttempts + 1);
      expect(saved.attempts).toBe(3);
      expect(saved.nextAttemptAt?.getTime()).toBe(
        now.getTime() + recoveryDelay(saved.recoveryAttempts),
      );
      expect(saved.updatedAt.getTime()).toBe(now.getTime());
      expect(saved.quarantinedAt?.getTime() ?? null).toBe(
        saved.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS ? now.getTime() : null,
      );
    }
  });
  it('overlapping workers claim an operation once during its lease', async () => {
    const op = await create();
    const [a, b] = await Promise.all([claimRecoveryBatch(prisma), claimRecoveryBatch(prisma)]);
    expect([...a, ...b].filter((row) => row.id === op.id)).toHaveLength(1);
  });
  it('operator resume preserves provider dispatch history and records evidence', async () => {
    const op = await create(3, MAX_RECOVERY_ATTEMPTS);
    await prisma.paymentOperation.update({
      where: { id: op.id },
      data: { quarantinedAt: new Date() },
    });
    // actorId is nullable in the audit schema; use an existing synthetic user.
    const actor = await prisma.user.create({
      data: { phone: `recovery-${randomUUID()}`, role: 'ADMIN' },
    });
    try {
      const updated = await prisma.$transaction((tx) =>
        reviewRecovery(tx, {
          id: op.id,
          actorId: actor.id,
          action: 'resume',
          evidence: 'Provider lookup completed; resume the existing reference only',
        }),
      );
      expect(updated.attempts).toBe(3);
      expect(updated.recoveryAttempts).toBe(0);
      expect(updated.quarantinedAt).toBeNull();
      expect(
        await prisma.auditLog.count({
          where: { target: op.id, action: 'payment.recovery.resume' },
        }),
      ).toBe(1);
    } finally {
      await prisma.user.delete({ where: { id: actor.id } });
    }
  });
});
