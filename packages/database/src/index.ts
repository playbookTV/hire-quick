import { PrismaClient } from '@prisma/client';

// Re-export the generated client types + enums so consumers import from @hq/database.
export * from '@prisma/client';
export { PrismaClient };

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Process-wide singleton (avoids exhausting Neon connections on hot reload). */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  // Generous interactive-transaction ceiling: escrow/ledger transactions take
  // SELECT … FOR UPDATE locks and chain several writes, which over Neon's network
  // latency routinely exceed Prisma's 5s default. Critical paths still pass their
  // own per-call opts (TX = 30s) which override this default.
  new PrismaClient({ transactionOptions: { timeout: 30_000, maxWait: 15_000 } });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
