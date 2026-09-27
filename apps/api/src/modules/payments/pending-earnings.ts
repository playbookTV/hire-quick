import type { Prisma } from '@hq/database';
import { cancellationSnapshot } from './cancellation-policy.js';
import type { RefundPayload } from './service.js';

/** Pending wallet previews use the reserved cancellation split, including frozen earnings. */
export async function pendingEarningsByBooking(
  db: Pick<Prisma.TransactionClient, 'paymentOperation'>,
  held: readonly { bookingId: string; usherPayout: number }[],
): Promise<Map<string, number>> {
  const result = new Map(held.map((p) => [p.bookingId, p.usherPayout]));
  if (!held.length) return result;
  const operations = await db.paymentOperation.findMany({
    where: {
      dedupeKey: { in: held.map((p) => `BOOKING_REFUND:${p.bookingId}`) },
      status: { in: ['PENDING', 'PROVIDER_OK'] },
    },
    select: { payload: true },
  });
  for (const op of operations) {
    const p = op.payload as unknown as RefundPayload;
    if (result.has(p.bookingId))
      result.set(
        p.bookingId,
        p.cancellation ? cancellationSnapshot(p.cancellation).usherPayoutKobo : 0,
      );
  }
  return result;
}
