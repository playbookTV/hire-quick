import { prisma } from '@hq/database';
import { redisConnection } from './redis.js';
import { env } from '../../env.js';
import { HttpPaystack } from '../payments/port/http-paystack.js';
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
      autocomplete: () => jobAutoComplete(realtime),
      noshow: () => jobNoShow(deps, realtime),
      reconcile: () => jobReconcile(deps, realtime),
      commission: (job) => jobCommissionSweep(deps, commissionPeriod(job)),
      checkouts: () => jobCheckouts(deps),
      resumeOps: () => jobResumePaymentOps(deps, realtime),
      retentionPurge: () => jobRetentionPurge(storage),
      auditVerify: () => jobAuditVerify(),
    },
    log: (message) => console.log(message),
    dispose: async () => {
      realtime.close();
      await prisma.$disconnect();
    },
  });
}
