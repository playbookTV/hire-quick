import { PrismaClient } from '@prisma/client';

// Re-export the generated client types + enums so consumers import from @hq/database.
export * from '@prisma/client';
export { PrismaClient };

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Process-wide singleton (avoids exhausting Neon connections on hot reload). */
export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
