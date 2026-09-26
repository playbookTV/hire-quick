/** Scheduled jobs run separately from the API and require REDIS_URL. */
import './observability/init.js';
import { logger } from './logger.js';
import { flushMonitoring, reportError } from './observability/reporting.js';
import { createJobRuntime } from './modules/jobs/queues.js';
import { runScheduledProcess } from './modules/jobs/runtime.js';

async function main(): Promise<void> {
  await runScheduledProcess(createJobRuntime(), (message) => logger.info(message));
}

void main().catch(async (error: unknown) => {
  logger.error({ err: error }, 'worker startup failed');
  reportError(error, { code: 'WORKER_STARTUP_FAILED' });
  await flushMonitoring();
  process.exitCode = 1;
});
