import { prisma } from '@hq/database';
import { redisConnection } from './redis.js';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { monitorJob } from '../../observability/jobs.js';
import { flushMonitoring, reportError } from '../../observability/reporting.js';
import { HttpPaystack } from '../payments/port/http-paystack.js';
import { cleanupStorage } from '../storage/uploads.js';
import { createStorageFromEnv } from '../storage/storage.js';
import { createEmitterGateway } from '../../realtime/gateway.js';
import { commissionPeriod, createScheduledRuntime, type ScheduledRuntime } from './runtime.js';
import {
  jobAutoComplete,
  jobNoShow,
  jobReconcile,
  jobCommissionSweep,
  jobResumePaymentOps,
  jobRetentionPurge,
  jobAuditVerify,
  jobCheckouts,
} from './jobs.js';

export function createJobRuntime(): ScheduledRuntime {
  const connection = redisConnection();
  const deps = { prisma, paystack: new HttpPaystack(env.PAYSTACK_SECRET_KEY) };
  const realtime = createEmitterGateway(env.REDIS_URL);
  const storage = createStorageFromEnv(env);
  return createScheduledRuntime({
    connection,
    handlers: {
      autocomplete: monitorJob('autocomplete', () => jobAutoComplete(realtime)),
      noshow: monitorJob('noshow', () => jobNoShow(deps, realtime)),
      reconcile: monitorJob('reconcile', () => jobReconcile(deps, realtime), env.BETTER_STACK_RECONCILIATION_HEARTBEAT_URL),
      commission: monitorJob('commission', (job) => jobCommissionSweep(deps, commissionPeriod(job))),
      checkouts: monitorJob('checkouts', () => jobCheckouts(deps), env.BETTER_STACK_CHECKOUTS_HEARTBEAT_URL),
      resumeOps: monitorJob('resumeOps', () => jobResumePaymentOps(deps, realtime)),
      storageCleanup: monitorJob('storageCleanup', async () => {
        const result = await cleanupStorage(storage);
        logger.info(result, 'storage cleanup');
        return result;
      }),
      retentionPurge: monitorJob('retentionPurge', () => jobRetentionPurge(storage)),
      auditVerify: monitorJob('auditVerify', () => jobAuditVerify(), env.BETTER_STACK_AUDIT_HEARTBEAT_URL),
    },
    log: (message) => logger.info(message),
    onError: (error) => {
      logger.error({ err: error, code: 'WORKER_RUNTIME_ERROR' }, 'worker runtime error');
      reportError(error, { code: 'WORKER_RUNTIME_ERROR' });
    },
    dispose: async () => {
      realtime.close();
      await prisma.$disconnect();
      await flushMonitoring();
    },
  });
}
