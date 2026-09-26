import { createScheduledRuntime, runScheduledProcess, type JobHandlers } from '../runtime.js';

const noop = async (): Promise<void> => {};
const handlers: JobHandlers = {
  autocomplete: noop,
  noshow: noop,
  reconcile: noop,
  checkouts: noop,
  resumeOps: noop,
  storageCleanup: noop,
  retentionPurge: noop,
  auditVerify: noop,
  commission: async () => {
    console.log('TEST_ACTIVE');
    await new Promise((resolve) => setTimeout(resolve, 400));
    console.log('TEST_CHECKPOINT_RECORDED');
  },
};
const runtime = createScheduledRuntime({
  connection: {
    host: '127.0.0.1',
    port: Number(process.env.TEST_REDIS_PORT),
    maxRetriesPerRequest: null,
  },
  queueName: process.env.TEST_QUEUE_NAME!,
  handlers,
  log: (message) => console.log(message),
  dispose: () => {
    console.log('TEST_DISPOSED');
  },
});
await runScheduledProcess(runtime, (message) => console.log(message));
