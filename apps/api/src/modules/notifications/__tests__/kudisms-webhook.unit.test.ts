/** Exercise the real app mount without database or provider requests. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../app.js';

const logs = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock('../../../logger.js', () => ({ logger: logs }));

const app = createApp();
const url = '/webhooks/kudisms';
const payload = (status = 'DELIVRD', code = '000') => ({
  status,
  api_reference: 'private-reference',
  data: { code, recipient: '2348012345678', description: 'private-description', cost: '1.50' },
  vendor: 'Kudisms',
});

beforeEach(() => vi.clearAllMocks());

describe('KudiSMS delivery callback', () => {
  it.each([
    ['DELIVRD', '000'],
    ['UNDELIVRD', '99'],
    ['UNDELIVRD', '100'],
    ['EXPIRED', '101'],
    ['REJECTD', '102'],
    ['UNKNOWN', '150'],
  ])('acknowledges %s/%s and logs only advisory status', async (status, code) => {
    const response = await request(app).post(url).send(payload(status, code));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(logs.info).toHaveBeenCalledOnce();
    expect(logs.info).toHaveBeenCalledWith(
      { provider: 'kudisms', verified: false, status, code },
      'SMS delivery report',
    );
    expect(
      JSON.stringify([logs.info.mock.calls, logs.error.mock.calls, logs.warn.mock.calls]),
    ).not.toMatch(/private-reference|private-description|2348012345678/);
  });
  it('acknowledges duplicates without triggering further delivery', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unexpected delivery'));
    try {
      for (let n = 0; n < 2; n++) {
        expect((await request(app).post(url).send(payload())).status).toBe(200);
      }
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
    }
  });
  it.each([
    {},
    { status: 'DELIVRD' },
    payload('OTHER', '000'),
    payload('DELIVRD', '100'),
    payload('DELIVRD', 'private-code'),
    { status: 'DELIVRD', data: null },
  ])('rejects invalid or inconsistent reports without logging payloads (%j)', async (body) => {
    const response = await request(app).post(url).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK');
    expect(logs.info).not.toHaveBeenCalled();
    expect(logs.error).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON without leaking the request in logs', async () => {
    const response = await request(app).post(url).type('json').send('{"private-recipient');
    expect(response.status).toBe(400);
    expect(logs.error).not.toHaveBeenCalled();
    expect(response.text).not.toContain('private-recipient');
  });
  it('enforces the callback body limit before the general JSON parser', async () => {
    const response = await request(app)
      .post(url)
      .send({ ...payload(), extra: 'x'.repeat(17_000) });
    expect(response.status).toBe(413);
    expect(logs.info).not.toHaveBeenCalled();
    expect(logs.error).not.toHaveBeenCalled();
  });
});
