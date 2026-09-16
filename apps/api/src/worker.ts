/**
 * Worker process entrypoint — runs the scheduled jobs (separate from the API
 * process). Start with `pnpm --filter @hq/api worker`. Needs REDIS_URL.
 */
import { createQueue, createWorker, scheduleAll } from './modules/jobs/queues.js';
import { redisConnectionLabel } from './modules/jobs/redis.js';

async function main(): Promise<void> {
  const queue = createQueue();
  await scheduleAll(queue);

  const worker = createWorker();
  worker.on('failed', (job, err) => {
    console.error(`[worker] ${job?.name ?? 'job'} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[worker] ${job.name} completed`);
  });

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void (async () => {
      try { await worker.close(); } finally { await queue.close(); }
    })().catch(() => {
      console.error('[worker] shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);

  const safeUrl = redisConnectionLabel();

  console.log(`hirequick worker started (redis ${safeUrl})`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
