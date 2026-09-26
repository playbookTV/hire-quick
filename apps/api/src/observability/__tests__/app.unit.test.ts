import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../app.js';
import { reportError } from '../reporting.js';

vi.mock('../reporting.js', () => ({ reportError: vi.fn(), reportAlarm: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('API monitoring integration', () => {
  it('distinguishes HTTP liveness from dependency readiness', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);
    const app = createApp();
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(503); // Redis was not configured.
    expect(ready.body).toEqual({ status: 'unavailable' });
  });
  it('captures unexpected errors with the response request ID, but not invalid JSON', async () => {
    const app = createApp({ corsOrigins: ['https://allowed.example'] });
    const allowed = await request(app).get('/health').set('Origin', 'https://allowed.example');
    expect(allowed.headers['access-control-expose-headers']).toBe('x-request-id');
    const failure = await request(app).get('/health').set('Origin', 'https://denied.example');
    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      code: 'INTERNAL',
      reqId: failure.headers['x-request-id'],
    });
    vi.mocked(reportError).mockClear();
    const invalid = await request(app)
      .post('/auth/otp/request')
      .type('json')
      .send('{"private":"invalid');
    expect(invalid.status).toBe(400);
    expect(reportError).not.toHaveBeenCalled();
  });
});
