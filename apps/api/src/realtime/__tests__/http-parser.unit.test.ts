import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { logger } from '../../logger.js';

afterEach(() => vi.restoreAllMocks());
describe('HTTP parser errors before chat validation', () => {
  it.each(['null', '{"content":"private-body"', '"private-body"'])('rejects malformed or primitive JSON with a generic 400', async (body) => {
    const log = vi.spyOn(logger, 'error');
    const response = await request(createApp()).post('/api/bookings/11111111-1111-4111-8111-111111111111/messages')
      .set('Content-Type', 'application/json').send(body);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'VALIDATION', message: 'Invalid JSON request' } });
    expect(log).not.toHaveBeenCalled();
  });

  it('returns a generic 413 for a body over the HTTP parser limit', async () => {
    const log = vi.spyOn(logger, 'error');
    const response = await request(createApp()).post('/api/bookings/11111111-1111-4111-8111-111111111111/messages')
      .send({ content: 'private-body'.repeat(100_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    expect(log).not.toHaveBeenCalled();
  });
});
