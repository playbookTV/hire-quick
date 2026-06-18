import type { Prisma } from '@hq/database';
import { prisma } from '@hq/database';

/** Append-only audit log for sensitive actions (TRD §14). */
export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target,
      ...(entry.metadata ? { metadata: entry.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
