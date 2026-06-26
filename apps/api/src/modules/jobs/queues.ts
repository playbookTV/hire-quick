/**
 * BullMQ wiring for the scheduled jobs. Cron patterns pick off-zero minutes so
 * many deployments don't all hit Paystack/Neon on the same tick.
 */
import { Queue, Worker, type Processor } from 'bullmq';
import { prisma } from '@hq/database';
import { redisConnection } from './redis.js';
import { env } from '../../env.js';
import { HttpPaystack } from '../payments/port/http-paystack.js';
import { createStorageFromEnv } from '../storage/storage.js';
import { createEmitterGateway } from '../../realtime/gateway.js';
import {
  jobAutoComplete,
  jobNoShow,
  jobReconcile,
  jobCommissionSweep,
  jobResumePaymentOps,
  jobRetentionPurge,
  jobAuditVerify,
} from './jobs.js';

export const QUEUE_NAME = 'hirequick-jobs';

export const SCHEDULES: ReadonlyArray<{ name: string; pattern: string }> = [
  { name: 'autocomplete', pattern: '*/10 * * * *' }, // D1 auto-complete
  { name: 'noshow', pattern: '3-59/10 * * * *' }, // offset 3 min
  { name: 'reconcile', pattern: '17 3 * * *' }, // daily 03:17 — the §17 alarm
  { name: 'commission', pattern: '23 4 * * *' }, // daily 04:23 (D3)
  { name: 'resumeOps', pattern: '*/15 * * * *' }, // resume durable payment ops + reconcile stuck withdrawals (§10/§17)
  { name: 'retentionPurge', pattern: '41 2 * * *' }, // daily 02:41 — NDPR purge (§14)
  { name: 'auditVerify', pattern: '47 2 * * *' }, // daily 02:47 — audit chain integrity
];

export function createQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: redisConnection() });
}

/** Register all repeatable jobs (idempotent — identical repeat opts dedupe). */
export async function scheduleAll(queue: Queue): Promise<void> {
  for (const s of SCHEDULES) {
    await queue.add(s.name, {}, { repeat: { pattern: s.pattern }, removeOnComplete: true, removeOnFail: 100 });
  }
}

export function createWorker(): Worker {
  const deps = { prisma, paystack: new HttpPaystack(env.PAYSTACK_SECRET_KEY) };
  // Worker holds no sockets — publish to the same Redis channels the API adapter reads.
  const realtime = createEmitterGateway(env.REDIS_URL);
  const storage = createStorageFromEnv(env);
  const processor: Processor = async (job) => {
    switch (job.name) {
      case 'autocomplete':
        return jobAutoComplete(realtime);
      case 'noshow':
        return jobNoShow(deps, realtime);
      case 'reconcile':
        return jobReconcile(deps);
      case 'commission':
        return jobCommissionSweep(deps);
      case 'resumeOps':
        return jobResumePaymentOps(deps, realtime);
      case 'retentionPurge':
        return jobRetentionPurge(storage);
      case 'auditVerify':
        return jobAuditVerify();
      default:
        return undefined;
    }
  };
  return new Worker(QUEUE_NAME, processor, { connection: redisConnection() });
}
