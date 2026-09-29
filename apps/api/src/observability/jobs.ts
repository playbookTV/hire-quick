import type { Processor } from 'bullmq';
import * as Sentry from '@sentry/node';
import { logger } from '../logger.js';
import { heartbeat } from './heartbeat.js';
import { reportError } from './reporting.js';

/** A false result signals an operational alarm without changing BullMQ retries. */
export function monitorJob(name: string, handler: Processor, heartbeatUrl = ''): Processor {
  return (job, token) =>
    Sentry.withIsolationScope(() =>
      Sentry.startSpan(
        {
          name: `job ${name}`,
          op: 'queue.task',
          parentSpan: null,
          attributes: { 'hq.kind': 'job', 'hq.job': name },
        },
        async (span) => {
          const started = performance.now();
          let healthy = false;
          try {
            const result: unknown = await handler(job, token);
            healthy = result !== false;
            span.setAttribute('hq.outcome', healthy ? 'ok' : 'alarm');
            span.setStatus(healthy ? { code: 1 } : { code: 2, message: 'internal_error' });
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
            span.setAttribute('hq.outcome', 'error');
            span.setStatus({ code: 2, message: 'internal_error' });
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
            // Exclude the monitoring provider's latency from the job duration.
            span.end();
            await heartbeat(heartbeatUrl, healthy);
          }
        },
      ),
    );
}
