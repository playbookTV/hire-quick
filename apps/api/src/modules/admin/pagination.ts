import { z } from 'zod';
/** Opt-in envelope preserves existing array consumers. Cursor ordering is createdAt + id. */
export const pageQuery = z.object({
  paged: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  cursor: z.string().uuid().optional(),
});
export function pageResult<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
}
