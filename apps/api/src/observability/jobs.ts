import type { Processor } from 'bullmq';
import { logger } from '../logger.js';
import { heartbeat } from './heartbeat.js';
import { reportError } from './reporting.js';

/** A false result signals an operational alarm without changing BullMQ retries. */
export function monitorJob(name: string, handler: Processor, heartbeatUrl = ''): Processor {
  return async (job, token) => {
    const started = performance.now();
    let healthy = false;
    try {
      const result: unknown = await handler(job, token);
      healthy = result !== false;
      logger.info(
        {
          job: name,
          outcome: healthy ? 'ok' : 'alarm',
          durationMs: Math.round(performance.now() - started),
        },
        'job completed',
      );
      return result;
    } catch (error) {
      logger.error(
        {
          err: error,
          job: name,
          attempt: job.attemptsMade + 1,
          durationMs: Math.round(performance.now() - started),
        },
        'job failed',
      );
      reportError(error, { job: name, code: 'JOB_FAILED' });
      throw error;
    } finally {
      await heartbeat(heartbeatUrl, healthy);
    }
  };
}
