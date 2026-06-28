/**
 * Zod request validators (TRD §24). Validate at every boundary
 * (application-security: server-side validation always). Expanded per phase;
 * these establish the pattern for the money-mutating endpoints.
 */
import { z } from 'zod';
import { ACCOMMODATION_STATUSES, REWARD_TYPES } from './enums.js';
import { MAX_INT32_KOBO } from './money.js';

export const uuid = z.string().uuid();

/** Events ending at or after this time (HH:MM) must declare accommodation. */
export const ACCOMMODATION_REQUIRED_FROM = '22:00';

/** Max work-photos an usher may list in their portfolio (server-enforced + UI gate). */
export const MAX_PORTFOLIO_PHOTOS = 5;

/** Whether an event ending at `endTime` (HH:MM) triggers the accommodation-disclosure rule. */
export function isLateNight(endTime: string): boolean {
  return endTime >= ACCOMMODATION_REQUIRED_FROM;
}

/**
 * The late-night safety rule (PRD §7): an event ending at/after 22:00 must
 * declare accommodation. Satisfied when the event isn't late-night, or when
 * accommodation has been disclosed (PROVIDED *or* NOT_PROVIDED — staff just
 * need to know). Single source of truth for create/PATCH/mobile so all
 * surfaces compute the same outcome.
 */
export function accommodationDisclosed(
  endTime: string | null | undefined,
  accommodation: string | null | undefined,
): boolean {
  if (!endTime) return true;
  return !isLateNight(endTime) || accommodation != null;
}

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
  amountKobo: z.number().int().positive().max(MAX_INT32_KOBO),
});
export type WithdrawInput = z.infer<typeof withdrawSchema>;

/** GET /payments/resolve-account — resolve a NUBAN to its account name. */
export const resolveAccountSchema = z.object({
  bankCode: z.string().min(3),
  accountNumber: z.string().regex(/^\d{10}$/, 'ten-digit account number'),
});
export type ResolveAccountInput = z.infer<typeof resolveAccountSchema>;

/** POST /bookings/:id/checkin/verify — usher submits the client-generated code. */
export const checkinVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'six digit code'),
});
export type CheckinVerifyInput = z.infer<typeof checkinVerifySchema>;

/** Shared event field shape; `createEventSchema`/`updateEventSchema` derive from it. */
export const eventFields = z.object({
  title: z.string().min(3).max(120),
  venue: z.string().min(2).max(200),
  category: z.string().min(2).max(60),
  eventDate: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  headcount: z.number().int().min(1).max(100),
  budgetPerHeadKobo: z.number().int().positive().max(MAX_INT32_KOBO),
  dressCode: z.string().max(200).optional(),
  accommodation: z.enum(ACCOMMODATION_STATUSES).optional(),
  requirements: z.string().max(2000).optional(),
});

/** POST /events — create a multi-staff event (PRD §7). */
export const createEventSchema = eventFields
  .refine((e) => e.endTime > e.startTime, {
    message: 'End time must be after the start time.',
    path: ['endTime'],
  })
  .refine((e) => accommodationDisclosed(e.endTime, e.accommodation), {
    message: 'Accommodation must be disclosed for events ending at or after 10:00 PM.',
    path: ['accommodation'],
  })
  // The aggregate charge (Order.gross = headcount × budgetPerHead) must also fit
  // the signed 32-bit Int money column, not just each field on its own.
  .refine((e) => e.headcount * e.budgetPerHeadKobo <= MAX_INT32_KOBO, {
    message: 'Total event budget exceeds the maximum allowed.',
    path: ['budgetPerHeadKobo'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * PATCH /events/:id — partial edit of an unstarted event. Only the time-ordering
 * rule can be checked statelessly here; the accommodation invariant is enforced
 * in the route against the merged record (the event may already carry it).
 */
export const updateEventSchema = eventFields.partial().superRefine((e, ctx) => {
  if (e.startTime != null && e.endTime != null && e.endTime <= e.startTime) {
    ctx.addIssue({ code: 'custom', message: 'End time must be after the start time.', path: ['endTime'] });
  }
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

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

/** POST /bookings/:id/reviews — a party rates the counterparty after completion. */
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** PUT /me/availability — usher marks a single day available/unavailable. */
export const setAvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  status: z.enum(['AVAILABLE', 'UNAVAILABLE']),
});
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

/** POST /bookings/:id/cancel — client cancels a confirmed booking (policy applies). */
export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
