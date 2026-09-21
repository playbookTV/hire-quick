import type { RedisOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { Queue, Worker, type Job, type JobsOptions, type Processor } from 'bullmq';

export const QUEUE_NAME = 'hirequick-jobs';

// Money jobs retry durable service entrypoints, never raw provider writes.
// Retention stays single-attempt pending its deletion outbox (OVA-146).
export const SCHEDULES = [
  { name: 'autocomplete', pattern: '*/10 * * * *', attempts: 3 },
  { name: 'noshow', pattern: '3-59/10 * * * *', attempts: 3 },
  { name: 'reconcile', pattern: '17 3 * * *', attempts: 3 },
  { name: 'commission', pattern: '23 4 * * *', attempts: 3 },
  { name: 'checkouts', pattern: '2-59/5 * * * *', attempts: 3 },
  { name: 'resumeOps', pattern: '*/15 * * * *', attempts: 3 },
  { name: 'retentionPurge', pattern: '41 2 * * *', attempts: 1 },
  { name: 'auditVerify', pattern: '47 2 * * *', attempts: 3 },
] as const;

export type JobName = (typeof SCHEDULES)[number]['name'];
export type JobHandlers = Record<JobName, Processor>;

export function scheduledOptions(schedule: (typeof SCHEDULES)[number]): JobsOptions {
  return {
    repeat: { pattern: schedule.pattern, tz: 'UTC' },
    attempts: schedule.attempts,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: 100,
  };
}

/** BullMQ prevMillis is the scheduled occurrence; timestamp is enqueue time. */
export function commissionPeriod(job: Pick<Job, 'opts' | 'timestamp'>): string {
  return new Date(job.opts.prevMillis ?? job.timestamp).toISOString().slice(0, 10);
}

export interface ScheduledRuntime {
  start(): Promise<void>;
  close(): Promise<void>;
}

/** Independent queues keep slow providers out of unrelated processing slots. */
export function createScheduledRuntime(options: {
  connection: Pick<
    RedisOptions,
    | 'host'
    | 'port'
    | 'db'
    | 'username'
    | 'password'
    | 'tls'
    | 'maxRetriesPerRequest'
    | 'retryStrategy'
    | 'connectTimeout'
  >;
  handlers: JobHandlers;
  queueName?: string;
  startupTimeoutMs?: number;
  log: (message: string) => void;
  dispose?: () => void | Promise<void>;
}): ScheduledRuntime {
  const prefix = options.queueName ?? QUEUE_NAME;
  const queues: Queue[] = [];
  const workers: Worker[] = [];
  let started = false;
  let running = false;
  let closing: Promise<void> | undefined;
  let probe: Redis | undefined;

  function close(): Promise<void> {
    closing ??= (async () => {
      probe?.disconnect();
      // Stop all workers fetching immediately; leave dependencies alive until
      // every active handler drains and BullMQ records its outcome.
      const workerResults = await Promise.allSettled(
        workers.map((worker) => worker.close(!running)),
      );
      const queueResults = await Promise.allSettled(queues.map((queue) => queue.close()));
      await options.dispose?.();
      if ([...workerResults, ...queueResults].some((result) => result.status === 'rejected')) {
        throw new Error('Scheduled worker cleanup failed');
      }
    })();
    return closing;
  }

  function makeQueue(name: string): Queue {
    const queue = new Queue(name, {
      connection: { ...options.connection, maxRetriesPerRequest: 1 },
    });
    queue.on('error', () => options.log(`[worker] queue connection error: ${name}`));
    queues.push(queue);
    return queue;
  }

  function makeWorker(name: string, processor: Processor): void {
    const worker = new Worker(name, processor, {
      connection: options.connection,
      autorun: false,
      concurrency: 1,
    });
    worker.on('error', () => options.log(`[worker] worker connection/runtime error: ${name}`));
    worker.on('failed', (job) =>
      options.log(`[worker] ${name} job failed (attempt ${String(job?.attemptsMade ?? 0)})`),
    );
    worker.on('completed', () => options.log(`[worker] ${name} job completed`));
    workers.push(worker);
  }

  async function start(): Promise<void> {
    if (started || closing) throw new Error('Scheduled worker already started or closed');
    started = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const initialize = async (): Promise<void> => {
        // Fail before allocating the BullMQ connection pool when Redis is down.
        // This also avoids closing BullMQ clients while their initial retry
        // promises are unresolved (which can surface late unhandled errors).
        probe = new Redis({
          ...options.connection,
          lazyConnect: true,
          retryStrategy: () => null,
          maxRetriesPerRequest: 1,
        });
        probe.on('error', () => options.log('[worker] Redis readiness check failed'));
        try {
          await probe.connect();
        } finally {
          probe.disconnect();
          probe = undefined;
        }
        if (closing) return;
        const legacy = makeQueue(prefix);
        // Drain existing jobs without discarding pending money work.
        makeWorker(prefix, async (job, token) => {
          const schedule = SCHEDULES.find((entry) => entry.name === job.name);
          if (!schedule) throw new Error('Unknown scheduled job');
          await options.handlers[schedule.name](job, token);
        });
        const scheduled = SCHEDULES.map((schedule) => {
          const name = `${prefix}-${schedule.name}`;
          const queue = makeQueue(name);
          makeWorker(name, options.handlers[schedule.name]);
          return { queue, schedule };
        });
        await Promise.all([...queues, ...workers].map((resource) => resource.waitUntilReady()));
        if (closing) return;
        // Register replacements first so partial startup cannot remove the only
        // schedule. Rollout must stop old worker replicas before starting these.
        for (const { queue, schedule } of scheduled) {
          if (closing) return;
          await queue.add(schedule.name, {}, scheduledOptions(schedule));
        }
        for (const repeat of await legacy.getRepeatableJobs()) {
          if (closing) return;
          if (SCHEDULES.some((schedule) => schedule.name === repeat.name)) {
            await legacy.removeRepeatableByKey(repeat.key);
          }
        }
      };
      await Promise.race([
        initialize(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Scheduled worker startup timed out')),
            options.startupTimeoutMs ?? 15_000,
          );
        }),
      ]);
      if (closing) throw new Error('Scheduled worker stopped during startup');
      running = true;
      for (const worker of workers) {
        void worker
          .run()
          .catch(() => options.log(`[worker] processing loop failed: ${worker.name}`));
      }
    } catch {
      await close();
      throw new Error('Scheduled worker startup failed; check Redis connectivity');
    } finally {
      clearTimeout(timer);
    }
  }
  return { start, close };
}

/** Shared by the entrypoint and subprocess termination tests. */
export async function runScheduledProcess(
  runtime: ScheduledRuntime,
  log: (message: string) => void,
): Promise<void> {
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    log('[worker] draining active jobs');
    void runtime
      .close()
      .then(() => log('[worker] shutdown complete'))
      .catch(() => {
        log('[worker] shutdown failed');
        process.exitCode = 1;
      })
      .finally(() => {
        process.removeListener('SIGTERM', stop);
        process.removeListener('SIGINT', stop);
      });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    await runtime.start();
    if (!stopping) log('[worker] scheduled jobs ready');
  } catch (error) {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    throw error;
  }
}
