import { z } from 'zod';

/** Voluntary, self-described presentation details. Never used for automatic eligibility. */
export const physicalAttributesSchema = z
  .object({
    gender: z.enum(['Male', 'Female', 'Non-binary', 'Self-described']).optional(),
    age: z.number().int().min(18).max(100).optional(),
    heightCm: z.number().int().min(100).max(250).optional(),
    shoeSizeUk: z.number().min(1).max(20).multipleOf(0.5).optional(),
    bodyType: z.string().trim().max(60).optional(),
    dressSize: z.string().trim().max(30).optional(),
    skinTone: z.string().trim().max(60).optional(),
    hairstyle: z.string().trim().max(60).optional(),
  })
  .strict();
export type PhysicalAttributes = z.infer<typeof physicalAttributesSchema>;

export const presentationPreferencesSchema = z
  .object({
    attributes: physicalAttributesSchema,
    rationale: z.string().trim().min(10).max(500),
  })
  .strict();
export type PresentationPreferences = z.infer<typeof presentationPreferencesSchema>;

export const DECLINE_REASONS = [
  'Unavailable on this date',
  'Pay does not meet my needs',
  'Location or travel',
  'Job requirements',
  'Other',
] as const;
export const invitationReplySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ACCEPTED') }).strict(),
  z
    .object({
      status: z.literal('DECLINED'),
      // Older clients may still send status alone; new clients always collect a reason.
      reason: z.enum(DECLINE_REASONS).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
]);
export type InvitationReply = z.infer<typeof invitationReplySchema>;

export const REPORT_REASONS = [
  'Misleading information',
  'Suspected scam',
  'Inappropriate content',
  'Unsafe or discriminatory requirements',
  'Other',
] as const;
export const marketplaceReportSchema = z
  .object({
    targetType: z.enum(['JOB', 'WORKER']),
    targetId: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().min(10).max(2000),
  })
  .strict();
export type MarketplaceReportInput = z.infer<typeof marketplaceReportSchema>;
export const REPORT_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] as const;
export const reviewReportSchema = z
  .object({
    expectedStatus: z.enum(REPORT_STATUSES),
    status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();

export const inviteBatchSchema = z.object({
  usherIds: z
    .array(z.string().uuid())
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each worker only once.'),
});

export const clientDetailsSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  position: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  contactEmail: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
});
