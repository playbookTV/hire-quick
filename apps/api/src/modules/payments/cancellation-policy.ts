/** Persisted cancellation quotes and approval checks shared by dispatch and ledger finalization. */
import { z } from 'zod';
import type { Prisma } from '@hq/database';
import {
  MAX_INT32_KOBO,
  MONEY_APPROVAL_THRESHOLD_KOBO,
  cancelWindow,
  cancellationSettlement,
  policyForCancellation,
} from '@hq/shared';
import { LedgerError } from './ledger/amounts.js';

const amount = z.number().int().min(0).max(MAX_INT32_KOBO);
const snapshotSchema = z.object({
  policy: z.literal('CLIENT_CANCEL_V1'),
  clientUserId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  eventStart: z.string().datetime(),
  window: z.enum(['GT_48H', 'BETWEEN_12_48H', 'LT_12H']),
  grossAmount: amount,
  refundKobo: amount,
  usherCompensationKobo: amount,
  platformFeeKobo: amount,
  usherPayoutKobo: amount,
  processingFeeKobo: z.literal(0),
});
export type CancellationSnapshot = z.infer<typeof snapshotSchema>;

export function cancellationSnapshot(value: unknown): CancellationSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new LedgerError('INVALID_CANCELLATION', 'cancellation quote is invalid');
  const p = parsed.data;
  if (cancelWindow(new Date(p.eventStart), new Date(p.requestedAt)) !== p.window)
    throw new LedgerError(
      'INVALID_CANCELLATION',
      'cancellation window does not match its accepted time',
    );
  const expected = cancellationSettlement(p.grossAmount, policyForCancellation('CLIENT', p.window));
  for (const key of [
    'refundKobo',
    'usherCompensationKobo',
    'platformFeeKobo',
    'usherPayoutKobo',
    'processingFeeKobo',
  ] as const)
    if (p[key] !== expected[key])
      throw new LedgerError(
        'INVALID_CANCELLATION',
        'cancellation amounts do not match the approved policy',
      );
  return p;
}

export async function cancellationApproved(
  db: Pick<Prisma.TransactionClient, 'approval'>,
  operationId: string,
  grossAmount: number,
): Promise<boolean> {
  if (grossAmount <= MONEY_APPROVAL_THRESHOLD_KOBO) return true;
  const approvals = await db.approval.findMany({
    where: {
      kind: 'REFUND',
      status: { in: ['APPROVED', 'EXECUTED'] },
      amountKobo: grossAmount,
      payload: { path: ['cancellationOperationId'], equals: operationId },
      maker: { role: 'ADMIN' },
      checker: { role: 'ADMIN' },
    },
    select: { makerId: true, checkerId: true },
  });
  return approvals.some((a) => !!a.checkerId && a.checkerId !== a.makerId);
}
