/** Scheduled jobs run separately from the API and require REDIS_URL. */
import { createJobRuntime } from './modules/jobs/queues.js';
import { runScheduledProcess } from './modules/jobs/runtime.js';

async function main(): Promise<void> {
  await runScheduledProcess(createJobRuntime(), (message) => console.log(message));
}

void main().catch(() => {
  console.error('[worker] startup failed; check Redis connectivity and worker configuration');
  process.exitCode = 1;
});
