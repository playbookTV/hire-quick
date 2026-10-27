import { z } from 'zod';

// Messages name the field: the app shows the first issue on its own.
const AGE = 'Age must be a whole number from 18 to 100.';
const HEIGHT = 'Height must be in centimetres, a whole number from 100 to 250.';
const SHOE_EU = 'Shoe size (EU) must be from 30 to 50, in whole or half sizes.';
const SHOE_UK = 'Shoe size (UK) must be from 1 to 20, in whole or half sizes.';

/** Voluntary, self-described presentation details. Never used for automatic eligibility. */
export const physicalAttributesSchema = z
  .object({
    gender: z.enum(['Male', 'Female', 'Non-binary', 'Self-described']).optional(),
    age: z.number({ invalid_type_error: AGE }).int(AGE).min(18, AGE).max(100, AGE).optional(),
    heightCm: z
      .number({ invalid_type_error: HEIGHT })
      .int(HEIGHT)
      .min(100, HEIGHT)
      .max(250, HEIGHT)
      .optional(),
    // Nigerian shops size shoes in EU numbers (e.g. 41). UK sizes remain for earlier profiles.
    shoeSizeEu: z
      .number({ invalid_type_error: SHOE_EU })
      .min(30, SHOE_EU)
      .max(50, SHOE_EU)
      .multipleOf(0.5, SHOE_EU)
      .optional(),
    shoeSizeUk: z
      .number({ invalid_type_error: SHOE_UK })
      .min(1, SHOE_UK)
      .max(20, SHOE_UK)
      .multipleOf(0.5, SHOE_UK)
      .optional(),
    bodyType: z.string().trim().max(60).optional(),
    dressSize: z.string().trim().max(30).optional(),
    skinTone: z.string().trim().max(60).optional(),
    hairstyle: z.string().trim().max(60).optional(),
  })
  .strict();
export type PhysicalAttributes = z.infer<typeof physicalAttributesSchema>;

/**
 * Dropdown choices in the app. The schema still accepts other short text, so older app
 * versions and values saved before the dropdowns keep working.
 */
export const SHOE_SIZES_EU: readonly number[] = Array.from({ length: 13 }, (_, i) => 35 + i);
export const BODY_TYPES = [
  'Slim',
  'Athletic',
  'Average',
  'Muscular',
  'Curvy',
  'Plus-size',
] as const;
/** Letter sizes, with the UK dress sizes they usually cover. */
export const CLOTHING_SIZES = [
  { value: 'XS', label: 'XS (UK 4–6)' },
  { value: 'S', label: 'S (UK 8–10)' },
  { value: 'M', label: 'M (UK 12–14)' },
  { value: 'L', label: 'L (UK 16–18)' },
  { value: 'XL', label: 'XL (UK 20–22)' },
  { value: 'XXL', label: 'XXL (UK 24–26)' },
  { value: '3XL', label: '3XL (UK 28+)' },
] as const;
export const SKIN_TONES = ['Fair', 'Light brown', 'Medium brown', 'Dark brown', 'Dark'] as const;
/** Starts with the styles clients can request for an event (Ponytail, Packable hair, Bob wig). */
export const HAIRSTYLES = [
  'Ponytail',
  'Packable hair',
  'Bob wig',
  'Other wig or weave',
  'Braids',
  'Cornrows',
  'Twists',
  'Locs',
  'Natural / afro',
  'Low cut',
  'Bald / shaved',
] as const;

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
