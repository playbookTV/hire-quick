import { afterEach, expect, it, vi } from 'vitest';
import { prisma, type PaymentOperation } from '@hq/database';
import { cancellationSettlement, policyForCancellation } from '@hq/shared';
import { cancelConfirmedBooking } from '../cancellation.js';
import { InMemoryPaystack } from '../port/paystack-port.js';

afterEach(() => vi.restoreAllMocks());
it('keeps a recorded high-value cancellation terminal without rechecking former admins', async () => {
  const clientUserId = '00000000-0000-4000-8000-000000000001';
  const cancellation = {
    policy: 'CLIENT_CANCEL_V1',
    clientUserId,
    requestedAt: '2026-09-21T12:00:00.000Z',
    eventStart: '2026-09-22T12:00:00.000Z',
    window: 'BETWEEN_12_48H',
    grossAmount: 6_000_001,
    ...cancellationSettlement(6_000_001, policyForCancellation('CLIENT', 'BETWEEN_12_48H')),
  };
  const op = {
    id: 'operation',
    status: 'RECORDED',
    payload: { cancellation },
  } as unknown as PaymentOperation;
  vi.spyOn(prisma, '$transaction').mockResolvedValue(op);
  vi.spyOn(prisma.paymentOperation, 'findUniqueOrThrow').mockResolvedValue(op);
  const approval = vi
    .spyOn(prisma.approval, 'findMany')
    .mockRejectedValue(new Error('former admin'));
  const paystack = new InMemoryPaystack();
  const refund = vi.spyOn(paystack, 'refund');
  expect(await cancelConfirmedBooking({ prisma, paystack }, 'booking', clientUserId)).toMatchObject(
    {
      status: 'RECORDED',
      operationId: 'operation',
      settlement: cancellation,
    },
  );
  expect(approval).not.toHaveBeenCalled();
  expect(refund).not.toHaveBeenCalled();
});
