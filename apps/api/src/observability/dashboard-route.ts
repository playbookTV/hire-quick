import { Router } from 'express';
import { prisma } from '@hq/database';
import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { createMonitoringDashboard } from './dashboard.js';

/** Mounted after the admin router's authentication and role gates. */
export function monitoringDashboardRouter(redis?: Redis): Router {
  const router = Router();
  const read = createMonitoringDashboard(
    {
      environment: env.NODE_ENV,
      release: env.SENTRY_RELEASE,
      betterStackToken: env.BETTER_STACK_API_TOKEN,
      monitorIds: {
        api: env.BETTER_STACK_API_MONITOR_ID,
        checkouts: env.BETTER_STACK_CHECKOUTS_MONITOR_ID,
        reconciliation: env.BETTER_STACK_RECONCILIATION_MONITOR_ID,
        audit: env.BETTER_STACK_AUDIT_MONITOR_ID,
      },
      sentryToken: env.SENTRY_READ_TOKEN,
      sentryOrganization: env.SENTRY_ORGANIZATION,
      sentryProjects: env.SENTRY_READ_PROJECTS.split(','),
      sentryOrigin: env.SENTRY_API_ORIGIN,
    },
    {
      database: () => prisma.$queryRaw`SELECT 1`,
      redis: async () => {
        if (!redis || redis.status !== 'ready') throw new Error('Redis unavailable');
        await redis.ping();
      },
    },
  );
  router.get('/observability', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    void read()
      .then((result) => res.json(result))
      .catch(next);
  });
  return router;
}
