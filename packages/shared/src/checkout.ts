import { z } from 'zod';

export const checkoutResponseSchema = z.object({
  orderId: z.string().uuid(),
  eventId: z.string().uuid(),
  bookingIds: z.array(z.string().uuid()).min(1).max(50),
  reference: z.string().min(1),
  authorizationUrl: z.string(),
  state: z.enum(['CREATED', 'INITIALIZING', 'READY', 'REVIEW', 'EXPIRED', 'PAID', 'REFUND_PENDING', 'REFUNDED']),
  expiresAt: z.string().datetime(),
  amountKobo: z.number().int().positive(),
  duplicate: z.boolean(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
