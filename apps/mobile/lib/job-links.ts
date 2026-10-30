import { z } from 'zod';

export function validJobId(id: unknown): id is string {
  return z.string().uuid().safeParse(id).success;
}

export function pendingJobId(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const value = z.object({ id: z.string().uuid(), savedAt: z.number() }).parse(JSON.parse(raw));
    return value.savedAt <= now && now - value.savedAt < 86_400_000 ? value.id : null;
  } catch {
    return null;
  }
}
