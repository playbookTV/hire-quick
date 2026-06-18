/**
 * Zod request validators (TRD §24). Validate at every boundary
 * (application-security: server-side validation always). Expanded per phase;
 * these establish the pattern for the money-mutating endpoints.
 */
import { z } from 'zod';

export const uuid = z.string().uuid();

/** ★ POST /orders — confirm a batch of accepted ushers into escrow (PRD §7). */
export const confirmOrderSchema = z.object({
  eventId: uuid,
  bookingTargets: z
    .array(z.object({ applicationId: uuid }))
    .min(1, 'select at least one usher')
    .max(50),
});
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;

/** ★ POST /withdrawals — usher withdraws available wallet balance to a bank account. */
export const withdrawSchema = z.object({
  bankAccountId: uuid,
  amountKobo: z.number().int().positive(),
});
export type WithdrawInput = z.infer<typeof withdrawSchema>;

/** POST /bookings/:id/checkin/verify — usher submits the client-generated code. */
export const checkinVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'six digit code'),
});
export type CheckinVerifyInput = z.infer<typeof checkinVerifySchema>;

/** POST /events — create a multi-staff event (PRD §7). */
export const createEventSchema = z
  .object({
    title: z.string().min(3).max(120),
    venue: z.string().min(2).max(200),
    category: z.string().min(2).max(60),
    eventDate: z.coerce.date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    headcount: z.number().int().min(1).max(100),
    budgetPerHeadKobo: z.number().int().positive(),
    dressCode: z.string().max(200).optional(),
    requirements: z.string().max(2000).optional(),
  })
  .refine((e) => e.endTime > e.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;
