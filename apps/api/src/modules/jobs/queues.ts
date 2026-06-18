/**
 * BullMQ wiring for the scheduled jobs. Cron patterns pick off-zero minutes so
 * many deployments don't all hit Paystack/Neon on the same tick.
 */
import { Queue, Worker, type Processor } from 'bullmq';
import { prisma } from '@hq/database';
import { redisConnection } from './redis.js';
import { env } from '../../env.js';
import { HttpPaystack } from '../payments/port/http-paystack.js';
import { jobAutoComplete, jobNoShow, jobReconcile, jobCommissionSweep, jobTransferRetry } from './jobs.js';

export const QUEUE_NAME = 'hirequick-jobs';

export const SCHEDULES: ReadonlyArray<{ name: string; pattern: string }> = [
  { name: 'autocomplete', pattern: '*/10 * * * *' }, // D1 auto-complete
  { name: 'noshow', pattern: '3-59/10 * * * *' }, // offset 3 min
  { name: 'reconcile', pattern: '17 3 * * *' }, // daily 03:17 — the §17 alarm
  { name: 'commission', pattern: '23 4 * * *' }, // daily 04:23 (D3)
  { name: 'transferRetry', pattern: '*/30 * * * *' },
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
  const processor: Processor = async (job) => {
    switch (job.name) {
      case 'autocomplete':
        return jobAutoComplete();
      case 'noshow':
        return jobNoShow();
      case 'reconcile':
        return jobReconcile(deps);
      case 'commission':
        return jobCommissionSweep(deps);
      case 'transferRetry':
        return jobTransferRetry();
      default:
        return undefined;
    }
  };
  return new Worker(QUEUE_NAME, processor, { connection: redisConnection() });
}
