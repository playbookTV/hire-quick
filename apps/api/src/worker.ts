/**
 * Worker process entrypoint — runs the scheduled jobs (separate from the API
 * process). Start with `pnpm --filter @hq/api worker`. Needs REDIS_URL.
 */
import { createQueue, createWorker, scheduleAll } from './modules/jobs/queues.js';
import { env } from './env.js';

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

  const safeUrl = env.REDIS_URL.replace(/:[^:@]+@/, ':****@');
   
  console.log(`hirequick worker started (redis ${safeUrl})`);
}

main().catch((e: unknown) => {
   
  console.error(e);
  process.exit(1);
});
