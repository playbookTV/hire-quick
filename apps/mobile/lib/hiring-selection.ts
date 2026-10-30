import { z } from 'zod';

/** Route params are untrusted, and invite-batch accepts at most 50 unique IDs. */
export function parseWorkerSelection(value?: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  const ids = value.split(',');
  if (ids.length > 50 || ids.some((id) => !z.string().uuid().safeParse(id).success)) return [];
  return [...new Set(ids)];
}
