import { z } from 'zod';
import { WITHDRAWAL_STATUSES } from './enums.js';

/** A persisted withdrawal outcome, including the wallet balance after settlement. */
export const withdrawalResponseSchema = z.object({
  withdrawalId: z.string().uuid(),
  duplicate: z.boolean(),
  status: z.enum(WITHDRAWAL_STATUSES),
  amountKobo: z.number().int().positive(),
  bankAccountId: z.string().uuid(),
  availableBalance: z.number().int().nonnegative(),
});

export type WithdrawalResponse = z.infer<typeof withdrawalResponseSchema>;
