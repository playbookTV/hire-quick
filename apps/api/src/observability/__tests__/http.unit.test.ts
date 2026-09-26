import express from 'express';
import request from 'supertest';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { requestLogging } from '../http.js';
import { readinessHandler } from '../readiness.js';

describe('HTTP observability', () => {
  it('logs templates and timing without customer data; bounds request IDs', async () => {
    const lines: string[] = [];
    const app = express();
    app.use(
      requestLogging(
        pino(
          { base: null },
          {
            write: (line) => {
              lines.push(line);
            },
          },
        ),
      ),
    );
    app.get('/bookings/:id', (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app)
      .get('/bookings/private-booking?token=secret-query')
      .set('authorization', 'Bearer secret-auth')
      .set('x-request-id', 'private-phone-number');
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      route: '/bookings/:id',
      statusCode: 200,
      aborted: false,
    });
    expect(JSON.parse(lines[0]!)).toHaveProperty('durationMs');
    for (const secret of [
      'private-booking',
      'secret-query',
      'secret-auth',
      'private-phone-number',
    ]) {
      expect(lines.join('')).not.toContain(secret);
    }
    const id = 'daec3c35-94d3-4d30-a9c6-a233d0fe9c20';
    expect(
      (await request(app).get('/unknown-secret-path').set('x-request-id', id)).headers[
        'x-request-id'
      ],
    ).toBe(id);
    expect(lines.join('')).not.toContain('unknown-secret-path');
    expect(JSON.parse(lines[1]!)).toMatchObject({ route: 'unmatched', statusCode: 404, level: 40 });
  });

  it('requires both dependencies and conceals failure details', async () => {
    const healthy = express().get(
      '/ready',
      readinessHandler({ database: async () => 1, redis: async () => 'PONG' }),
    );
    expect((await request(healthy).get('/ready')).body).toEqual({ status: 'ready' });
    const broken = express().get(
      '/ready',
      readinessHandler({
        database: () => Promise.reject(new Error('postgresql://private:secret@host')),
        redis: async () => 'PONG',
      }),
    );
    const res = await request(broken).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('times out hung probes without stacking up more probes', async () => {
    let calls = 0;
    const app = express().get(
      '/ready',
      readinessHandler(
        {
          database: () => {
            calls++;
            return new Promise(() => {});
          },
          redis: async () => 'PONG',
        },
        10,
      ),
    );
    expect((await request(app).get('/ready')).status).toBe(503);
    expect((await request(app).get('/ready')).status).toBe(503);
    expect(calls).toBe(1);
  });
});
