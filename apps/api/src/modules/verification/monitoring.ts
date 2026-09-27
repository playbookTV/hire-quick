import { prisma as database, type PrismaClient } from '@hq/database';
import { reportSmile } from '../../observability/smile.js';

/** Counts only each usher's latest attempt. No identity data or provider payload leaves SQL. */
export async function readSmileHealth(prisma: PrismaClient = database) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
    const [row] = await tx.$queryRaw<Array<{ pending: number; stalled: number; withoutCallback: number; rejected: number; providerErrors: number }>>`
      WITH latest AS (
        SELECT DISTINCT ON (v."usherId") v.status, v.provider, v."createdAt", v."govLookup"
        FROM usher_verifications v
        ORDER BY v."usherId", v."createdAt" DESC, v.id DESC
      )
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < NOW() - INTERVAL '1 hour')::int AS stalled,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < NOW() - INTERVAL '1 hour'
          AND COALESCE("govLookup"->>'providerJobId', '') = '')::int AS "withoutCallback",
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "govLookup"->>'providerStatus' IN ('error', 'attention'))::int AS "providerErrors"
      FROM latest WHERE provider = 'SMILE_ID' AND "createdAt" >= NOW() - INTERVAL '7 days'
    `;
    return { status: 'available' as const, ...row!, checkedAt: new Date().toISOString(), windowDays: 7 as const, stalledAfterMinutes: 60 as const };
  }, { timeout: 4000, maxWait: 2000 });
}

export async function monitorSmileAttempts(): Promise<void> {
  const health = await readSmileHealth();
  if (health.stalled > 0) reportSmile('SMILE_STALLED_ATTEMPTS');
}
