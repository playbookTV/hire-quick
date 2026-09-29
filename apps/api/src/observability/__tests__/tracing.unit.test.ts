import express from 'express';
import request from 'supertest';
import { pino } from 'pino';
import type { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';
import { requestLogging } from '../http.js';
import { monitorJob } from '../jobs.js';
import { sanitizeErrorEvent, sanitizeSpan } from '../privacy.js';

type SentSpan = {
  name: string;
  trace_id: string;
  span_id: string;
  status: string;
  start_timestamp: number;
  end_timestamp: number;
  attributes: Record<string, { value: unknown }>;
};

function capture(sampleRate = 1) {
  const envelopes: unknown[] = [];
  const spans: SentSpan[] = [];
  const errors: Sentry.ErrorEvent[] = [];
  Sentry.init({
    dsn: 'https://public@example.com/1',
    defaultIntegrations: false,
    enableRuntimeChannelInjection: false,
    traceLifecycle: 'stream',
    tracesSampleRate: sampleRate,
    tracePropagationTargets: [],
    beforeSend: sanitizeErrorEvent,
    beforeSendSpan: sanitizeSpan,
    environment: 'test',
    release: 'tracing-fixture',
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'span') spans.push(...(payload as { items: SentSpan[] }).items);
          if (header.type === 'event') errors.push(payload as Sentry.ErrorEvent);
        }
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  return { envelopes, spans, errors };
}

afterEach(async () => {
  await Sentry.close(1000);
});

describe('private performance tracing', () => {
  it('sends request timing and route templates while excluding customer data', async () => {
    const captured = capture();
    const app = express();
    app.use(requestLogging(pino({ enabled: false })));
    app.get('/bookings/:id', (_req, res) => {
      Sentry.setUser({ email: 'secret-user@example.com' });
      Sentry.setAttribute('private', 'secret-attribute');
      Sentry.setTag('customer', 'secret-customer');
      Sentry.getActiveSpan()?.setAttribute('db.statement', 'secret-sql');
      res.sendStatus(200);
    });
    await request(app)
      .get('/bookings/secret-id?token=secret-query')
      .set('Authorization', 'Bearer secret-auth');
    await request(app).get('/secret-unmatched');
    await Sentry.flush(1000);
    expect(captured.spans.map((span) => span.name)).toEqual(['GET /bookings/:id', 'GET unmatched']);
    expect(captured.spans[0]?.attributes['http.response.status_code']?.value).toBe(200);
    expect(captured.spans[0]?.attributes['sentry.environment']?.value).toBe('test');
    expect(captured.spans[0]?.attributes['sentry.release']?.value).toBe('tracing-fixture');
    expect(captured.spans[0]!.end_timestamp).toBeGreaterThanOrEqual(
      captured.spans[0]!.start_timestamp,
    );
    expect(JSON.stringify(captured.envelopes)).not.toContain('secret');
  });

  it('isolates concurrent requests and correlates a sanitized error with its span', async () => {
    const captured = capture();
    const app = express();
    app.use(requestLogging(pino({ enabled: false })));
    app.get('/failed/:id', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      Sentry.captureException(new Error('Request processing failed'));
      res.sendStatus(500);
    });
    app.get('/healthy/:id', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      res.sendStatus(200);
    });
    await Promise.all([
      request(app).get('/failed/secret-one'),
      request(app).get('/healthy/secret-two'),
    ]);
    await Sentry.flush(1000);
    const failed = captured.spans.find((span) => span.name === 'GET /failed/:id');
    expect(captured.spans).toHaveLength(2);
    expect(new Set(captured.spans.map((span) => span.trace_id)).size).toBe(2);
    expect(failed?.status).toBe('error');
    expect(captured.errors[0]?.exception?.values?.[0]?.value).toBe('Request processing failed');
    expect(captured.errors[0]?.contexts?.trace).toMatchObject({
      trace_id: failed?.trace_id,
      span_id: failed?.span_id,
    });
    expect(JSON.stringify(captured.envelopes)).not.toContain('secret');
  });

  it('records job success, alarms and failures without changing results or retries', async () => {
    const captured = capture();
    const job = { attemptsMade: 0, data: { customer: 'secret-job-data' } } as Job;
    const failure = new Error('Provider request failed');
    await expect(monitorJob('checkouts', async () => 'done')(job)).resolves.toBe('done');
    await expect(monitorJob('reconcile', async () => false)(job)).resolves.toBe(false);
    await expect(
      monitorJob('autocomplete', async () => {
        throw failure;
      })(job),
    ).rejects.toBe(failure);
    await Sentry.flush(1000);
    expect(
      captured.spans.map((span) => [span.name, span.status, span.attributes['hq.outcome']?.value]),
    ).toEqual([
      ['job checkouts', 'ok', 'ok'],
      ['job reconcile', 'error', 'alarm'],
      ['job autocomplete', 'error', 'error'],
    ]);
    expect(JSON.stringify(captured.envelopes)).not.toContain('secret');
  });

  it('disables performance collection at rate zero while retaining errors', async () => {
    const captured = capture(0);
    await Sentry.startSpan({ name: 'unsampled' }, async () => {
      Sentry.captureException(new Error('secret-failure'));
    });
    await Sentry.flush(1000);
    expect(captured.spans).toHaveLength(0);
    expect(captured.errors).toHaveLength(1);
  });

  it('ends an aborted request once and marks it as a failure', async () => {
    const captured = capture();
    const app = express();
    app.use(requestLogging(pino({ enabled: false })));
    app.get('/aborted/:id', (_req, res) => {
      res.destroy();
    });
    await expect(request(app).get('/aborted/secret-id')).rejects.toThrow();
    await Sentry.flush(1000);
    expect(captured.spans).toHaveLength(1);
    expect(captured.spans[0]).toMatchObject({ name: 'GET /aborted/:id', status: 'error' });
    expect(captured.spans[0]?.attributes['hq.aborted']?.value).toBe(true);
    expect(JSON.stringify(captured.envelopes)).not.toContain('secret');
  });

  it('rebuilds unknown spans without names, links or arbitrary attributes', () => {
    const sanitized = sanitizeSpan({
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16),
      name: 'secret-span',
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'error',
      is_segment: true,
      attributes: {
        'db.statement': 'secret-sql',
        'user.email': 'secret-email',
        'sentry.segment.name': 'secret-name',
      },
      links: [
        {
          trace_id: 'a'.repeat(32),
          span_id: 'c'.repeat(16),
          attributes: { private: 'secret-link' },
        },
      ],
    });
    expect(sanitized.name).toBe('operation');
    expect(JSON.stringify(sanitized)).not.toContain('secret');
    expect(sanitized.links).toBeUndefined();
  });
});
