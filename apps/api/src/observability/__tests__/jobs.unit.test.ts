import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { monitorJob } from '../jobs.js';
import { heartbeat } from '../heartbeat.js';
import { reportError } from '../reporting.js';

vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../reporting.js', () => ({ reportError: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const job = { attemptsMade: 0 } as Job;
const url = 'https://uptime.betterstack.com/api/v1/heartbeat/fixture';

describe('job monitoring', () => {
  it('reports success and operational alarms separately without changing job outcomes', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    await expect(monitorJob('reconcile', async () => true, url)(job)).resolves.toBe(true);
    expect(fetch).toHaveBeenLastCalledWith(url, expect.objectContaining({ method: 'POST' }));
    await expect(monitorJob('reconcile', async () => false, url)(job)).resolves.toBe(false);
    expect(fetch).toHaveBeenLastCalledWith(`${url}/fail`, expect.anything());
  });
  it('retains the original error for BullMQ retries even when monitoring fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('monitoring unavailable')));
    const error = new Error('provider error');
    await expect(monitorJob('checkouts', () => Promise.reject(error), url)(job)).rejects.toBe(
      error,
    );
    expect(reportError).toHaveBeenCalledWith(error, { job: 'checkouts', code: 'JOB_FAILED' });
    await expect(monitorJob('checkouts', async () => 'done', url)(job)).resolves.toBe('done');
  });
  it('does no network work without configuration and absorbs HTTP rejection', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetch);
    await heartbeat('', true);
    expect(fetch).not.toHaveBeenCalled();
    await expect(heartbeat(url, true)).resolves.toBeUndefined();
  });
});
