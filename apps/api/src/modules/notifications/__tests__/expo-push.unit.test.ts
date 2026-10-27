/** The Expo HTTP client: auth header, bounded retries, and secret-free logs. No database. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: { NODE_ENV: 'production' as 'test' | 'production', EXPO_ACCESS_TOKEN: '' },
  log: vi.fn(),
  report: vi.fn(),
}));
vi.mock('../../../env.js', () => ({ env: state.env }));
vi.mock('../../../logger.js', () => ({ logger: { info: state.log, warn: state.log, error: state.log } }));
vi.mock('../../../observability/reporting.js', () => ({ reportError: state.report }));
vi.mock('@hq/database', () => ({ prisma: {} }));

const url = 'https://exp.host/--/api/v2/push/send';
const body = [{ to: 'ExponentPushToken[secret-device]', body: 'secret-text' }];
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.resetModules();
  Object.assign(state.env, { NODE_ENV: 'production', EXPO_ACCESS_TOKEN: '' });
  state.log.mockClear();
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = () => new Response(JSON.stringify({ data: [{ status: 'ok', id: 't-1' }] }), { status: 200 });

describe('Expo push client', () => {
  it('sends JSON with the access token only when one is configured', async () => {
    fetcher.mockResolvedValue(ok());
    const { expoPost } = await import('../push.js');
    expect(await expoPost(url, body)).toEqual({ data: [{ status: 'ok', id: 't-1' }] });
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('authorization');

    state.env.EXPO_ACCESS_TOKEN = 'expo-access-secret';
    fetcher.mockResolvedValue(ok());
    await expoPost(url, body);
    const [target, init] = fetcher.mock.calls[1]!;
    expect(target).toBe(url);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer expo-access-secret', 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    vi.useFakeTimers();
    fetcher
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(ok());
    const { expoPost } = await import('../push.js');
    const result = expoPost(url, body);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ data: [{ status: 'ok', id: 't-1' }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('gives up after three network failures without logging what failed', async () => {
    vi.useFakeTimers();
    fetcher.mockRejectedValue(new Error('ExponentPushToken[secret-device] secret-text expo-access-secret'));
    state.env.EXPO_ACCESS_TOKEN = 'expo-access-secret';
    const { expoPost } = await import('../push.js');
    const result = expoPost(url, body);
    await vi.runAllTimersAsync();
    expect(await result).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(state.log).toHaveBeenCalledWith('[push] transport request failed');
    expect(JSON.stringify(state.log.mock.calls)).not.toMatch(/secret/);
  });

  it('does not retry a rejected request', async () => {
    fetcher.mockResolvedValue(new Response('provider-body-secret', { status: 400 }));
    const { expoPost } = await import('../push.js');
    expect(await expoPost(url, body)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(state.log).toHaveBeenCalledWith('[push] request failed: 400');
    expect(JSON.stringify(state.log.mock.calls)).not.toContain('provider-body-secret');
  });

  it('never reaches the network in isolated tests', async () => {
    state.env.NODE_ENV = 'test';
    const { expoPost, sendPush } = await import('../push.js');
    expect(await expoPost(url, body)).toBeNull();
    sendPush(
      [{ id: 'd-1', token: 'ExponentPushToken[secret-device]' }],
      { type: 'TEST', title: 'T', body: 'B', channel: 'bookings' },
      '7d0c3f0e-8f5e-4a52-9a43-2f6b6f1d2e10',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
