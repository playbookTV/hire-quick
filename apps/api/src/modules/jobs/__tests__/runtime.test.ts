/** Loopback Redis only: no configured Redis, database or provider requests. */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Queue, type Processor } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  commissionPeriod,
  createScheduledRuntime,
  scheduledOptions,
  SCHEDULES,
  type JobHandlers,
  type ScheduledRuntime,
} from '../runtime.js';

const available = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
let redis: ChildProcess | undefined;
let port: number;
const runtimes: ScheduledRuntime[] = [];
const queues: Queue[] = [];
const children: ChildProcess[] = [];

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 8_000;
  while (!(await predicate())) {
    if (Date.now() > end) throw new Error('Worker assertion timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  if (!available) return;
  port = await unusedPort();
  redis = spawn(
    'redis-server',
    ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  redis.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  await until(() => output.includes('Ready to accept connections'));
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
  }
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
});

afterAll(async () => {
  if (redis && redis.exitCode === null && redis.signalCode === null) {
    const exit = once(redis, 'exit');
    redis.kill('SIGTERM');
    await exit;
  }
});

function handlers(overrides: Partial<JobHandlers> = {}): JobHandlers {
  const noop: Processor = async () => {};
  return {
    autocomplete: noop,
    noshow: noop,
    reconcile: noop,
    commission: noop,
    checkouts: noop,
    resumeOps: noop,
    retentionPurge: noop,
    auditVerify: noop,
    ...overrides,
  };
}
function queue(name: string): Queue {
  const value = new Queue(name, { connection: { host: '127.0.0.1', port } });
  queues.push(value);
  return value;
}
function runtime(name: string, overrides: Partial<JobHandlers> = {}, dispose = vi.fn()) {
  const value = createScheduledRuntime({
    connection: { host: '127.0.0.1', port, maxRetriesPerRequest: null },
    queueName: name,
    handlers: handlers(overrides),
    log: vi.fn(),
    dispose,
  });
  runtimes.push(value);
  return value;
}

describe('scheduled commission identity', () => {
  it('uses the scheduled UTC day even when queued or retried on another day', () => {
    const timestamp = Date.parse('2026-09-20T04:23:01Z');
    const opts = { prevMillis: Date.parse('2026-09-21T04:23:00Z') };
    expect(commissionPeriod({ timestamp, opts })).toBe('2026-09-21');
    expect(commissionPeriod({ timestamp, opts: {} })).toBe('2026-09-20');
  });
});

describe.skipIf(!available)('scheduled worker with real disposable Redis', () => {
  it('registers schedules idempotently, retires legacy repeats and drains queued legacy work', async () => {
    const prefix = `hq-schedule-${randomUUID()}`;
    const legacy = queue(prefix);
    await legacy.add('commission', {}, { repeat: { pattern: '23 4 * * *' } });
    const old = await legacy.add('commission', {});
    const handled = vi.fn<Processor>(async () => {});
    const first = runtime(prefix, { commission: handled });
    await first.start();
    await until(async () => (await old.getState()) === 'completed');
    expect(handled).toHaveBeenCalled();
    expect(await legacy.getRepeatableJobs()).toEqual([]);
    const commissionQueue = queue(`${prefix}-commission`);
    const [occurrence] = await commissionQueue.getDelayed();
    const occurrencePeriod = commissionPeriod(occurrence!);
    await occurrence!.promote();
    await until(async () => (await occurrence!.getState()) === 'unknown'); // removed on completion
    expect(handled).toHaveBeenCalledTimes(2);
    expect(commissionPeriod(handled.mock.calls[1]![0])).toBe(occurrencePeriod);
    await first.close();
    const second = runtime(prefix);
    await second.start();
    for (const schedule of SCHEDULES) {
      const q = queue(`${prefix}-${schedule.name}`);
      const repeats = await q.getRepeatableJobs();
      expect(repeats).toHaveLength(1);
      expect(repeats[0]).toMatchObject({
        name: schedule.name,
        pattern: schedule.pattern,
        tz: 'UTC',
      });
      const delayed = await q.getDelayed();
      expect(delayed).toHaveLength(1);
      expect(delayed[0]!.opts).toMatchObject({
        attempts: schedule.attempts,
        backoff: { type: 'exponential', delay: 30_000 },
      });
    }
  });

  it('allows reconciliation past a blocked provider and drains before disposing dependencies', async () => {
    const prefix = `hq-isolation-${randomUUID()}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = false;
    let finished = false;
    const dispose = vi.fn();
    const rt = runtime(
      prefix,
      {
        commission: async () => {
          active = true;
          await held;
          finished = true;
        },
      },
      dispose,
    );
    await rt.start();
    try {
      const commission = await queue(`${prefix}-commission`).add('commission', {});
      await until(() => active);
      const reconciliation = await queue(`${prefix}-reconcile`).add('reconcile', {});
      await until(async () => (await reconciliation.getState()) === 'completed');
      const closing = rt.close();
      expect(dispose).not.toHaveBeenCalled();
      expect(finished).toBe(false);
      release();
      await closing;
      expect(await commission.getState()).toBe('completed');
      expect(finished).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(1);
      await rt.close();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  });

  it('backs off a failed attempt and retries the same commission identity', async () => {
    const prefix = `hq-retry-${randomUUID()}`;
    const periods: string[] = [];
    const rt = runtime(prefix, {
      commission: async (job) => {
        periods.push(commissionPeriod(job));
        if (job.attemptsMade === 0) throw new Error('transient read failure');
      },
    });
    await rt.start();
    const schedule = SCHEDULES.find((entry) => entry.name === 'commission')!;
    const opts = scheduledOptions(schedule);
    delete opts.repeat;
    const q = queue(`${prefix}-commission`);
    const job = await q.add(
      'commission',
      {},
      {
        ...opts,
        removeOnComplete: false,
        prevMillis: Date.parse('2026-09-20T04:23:00Z'),
      },
    );
    await until(async () => (await job.getState()) === 'delayed');
    const delayed = await q.getJob(job.id!);
    expect(delayed!.delay).toBe(30_000);
    await job.promote(); // Exercise the real retry without waiting 30 seconds.
    await until(async () => (await job.getState()) === 'completed');
    expect(periods).toEqual(['2026-09-20', '2026-09-20']);
  });

  it('fails startup loudly and disposes clients when Redis is unavailable', async () => {
    const deadPort = await unusedPort();
    const log = vi.fn();
    const dispose = vi.fn();
    const rt = createScheduledRuntime({
      connection: {
        host: '127.0.0.1',
        port: deadPort,
        maxRetriesPerRequest: null,
        retryStrategy: () => 20,
      },
      startupTimeoutMs: 150,
      handlers: handlers(),
      log,
      dispose,
    });
    runtimes.push(rt);
    await expect(rt.start()).rejects.toThrow('startup failed');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it('bounds startup when a TCP server accepts but never answers Redis commands', async () => {
    const sockets: Socket[] = [];
    const stalled = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve, reject) => {
      stalled.once('error', reject);
      stalled.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = stalled.address();
      if (!address || typeof address === 'string') throw new Error('Missing loopback address');
      const dispose = vi.fn();
      const rt = createScheduledRuntime({
        connection: { host: '127.0.0.1', port: address.port },
        startupTimeoutMs: 100,
        handlers: handlers(),
        log: vi.fn(),
        dispose,
      });
      runtimes.push(rt);
      const started = Date.now();
      await expect(rt.start()).rejects.toThrow('startup failed');
      expect(Date.now() - started).toBeLessThan(2000);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => stalled.close(() => resolve()));
    }
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'drains an active subprocess job on %s before exiting',
    async (signal) => {
      const prefix = `hq-signal-${randomUUID()}`;
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('./worker-child.ts', import.meta.url))],
        {
          env: { ...process.env, TEST_REDIS_PORT: String(port), TEST_QUEUE_NAME: prefix },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.push(child);
      let output = '';
      child.stdout!.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exit = once(child, 'exit');
      await until(() => output.includes('scheduled jobs ready'));
      const job = await queue(`${prefix}-commission`).add('commission', {});
      await until(() => output.includes('TEST_ACTIVE'));
      child.kill(signal);
      await until(() => child.exitCode !== null || child.signalCode !== null);
      expect(await exit).toEqual([0, null]);
      expect(output).toContain('shutdown complete');
      expect(output.indexOf('TEST_CHECKPOINT_RECORDED')).toBeLessThan(
        output.indexOf('TEST_DISPOSED'),
      );
      expect(await job.getState()).toBe('completed');
    },
  );
});
