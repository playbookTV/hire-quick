/**
 * Zod request validators (TRD §24). Validate at every boundary
 * (application-security: server-side validation always). Expanded per phase;
 * these establish the pattern for the money-mutating endpoints.
 */
import { z } from 'zod';
import { ACCOMMODATION_STATUSES, REWARD_TYPES } from './enums.js';

export const uuid = z.string().uuid();

/** Events ending at or after this time (HH:MM) must declare accommodation. */
export const ACCOMMODATION_REQUIRED_FROM = '22:00';

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
    accommodation: z.enum(ACCOMMODATION_STATUSES).optional(),
    requirements: z.string().max(2000).optional(),
  })
  .refine((e) => e.endTime > e.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  })
  .refine((e) => e.endTime < ACCOMMODATION_REQUIRED_FROM || e.accommodation != null, {
    message: 'accommodation is required for events ending at or after 22:00',
    path: ['accommodation'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Admin: create a reward milestone tier (TRD §15 admin config). */
export const createMilestoneTierSchema = z.object({
  threshold: z.number().int().positive(),
  name: z.string().min(2).max(120),
  rewardType: z.enum(REWARD_TYPES),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
});
export type CreateMilestoneTierInput = z.infer<typeof createMilestoneTierSchema>;

/** Admin: update a reward milestone tier (all fields optional). */
export const updateMilestoneTierSchema = createMilestoneTierSchema.partial();
export type UpdateMilestoneTierInput = z.infer<typeof updateMilestoneTierSchema>;
