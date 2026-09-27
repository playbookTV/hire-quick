import { describe, expect, it, vi } from 'vitest';
import { createSmileReporter, safeSmileTags } from './smile-monitoring.js';

const attempt = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Smile telemetry boundary', () => {
  it('allows only fixed diagnostics and random attempt references', () => {
    expect(safeSmileTags({ code: 'SMILE_CAPTURE_FAILED', attempt, token: 'secret', stage: 'secret' }))
      .toEqual({ code: 'SMILE_CAPTURE_FAILED', provider: 'smile_id', stage: 'capture_submission', attempt });
    expect(safeSmileTags({ code: 'secret', attempt })).toEqual({});
    expect(safeSmileTags({ code: 'SMILE_CAPTURE_FAILED', attempt: '12345678901' })).not.toHaveProperty('attempt');
    expect(safeSmileTags({ code: '__proto__' })).toEqual({});
  });
  it('deduplicates retries but distinguishes stages and attempts; reporting cannot throw', () => {
    let time = 0;
    const send = vi.fn(); const report = createSmileReporter(send, () => time);
    report('SMILE_CAPTURE_FAILED', attempt); report('SMILE_CAPTURE_FAILED', attempt);
    expect(send).toHaveBeenCalledTimes(1);
    report('SMILE_TOKEN_REFRESH_FAILED', attempt);
    expect(send).toHaveBeenCalledTimes(2);
    time = 15 * 60_000;
    report('SMILE_CAPTURE_FAILED', attempt);
    expect(send).toHaveBeenCalledTimes(3);
    expect(() => createSmileReporter(() => { throw new Error('offline'); })('SMILE_CAPTURE_FAILED')).not.toThrow();
  });
  it('records normal provider rejections as information, not errors', () => {
    const send = vi.fn();createSmileReporter(send)('SMILE_PROVIDER_REJECTED', attempt);
    expect(send).toHaveBeenCalledWith('SMILE_PROVIDER_REJECTED', expect.any(Object), 'info');
  });
  it('keeps only approved SDK codes and HTTP status values through repeated sanitization', () => {
    const tags = safeSmileTags({ code: 'SMILE_CAPTURE_FAILED', sdk_error: 'NETWORK_FORBIDDEN', http_status: 403 });
    expect(safeSmileTags(tags)).toEqual(tags);
    expect(tags).toMatchObject({ sdk_error: 'NETWORK_FORBIDDEN', http_status: '403' });
    for (const http_status of ['403 secret', '0403', 403.1, 999, NaN, {}, null]) {
      expect(safeSmileTags({ code: 'SMILE_CAPTURE_FAILED', sdk_error: 'secret', http_status })).not.toHaveProperty('http_status');
      expect(safeSmileTags({ code: 'SMILE_CAPTURE_FAILED', sdk_error: 'secret', http_status })).not.toHaveProperty('sdk_error');
    }
  });
  it('deduplicates the same SDK error while retaining a different failure on retry', () => {
    const send = vi.fn(); const report = createSmileReporter(send);
    report('SMILE_CAPTURE_FAILED', attempt, { sdkError: 'NETWORK_FORBIDDEN', httpStatus: 403 });
    report('SMILE_CAPTURE_FAILED', attempt, { sdkError: 'NETWORK_FORBIDDEN', httpStatus: 403 });
    report('SMILE_CAPTURE_FAILED', attempt, { sdkError: 'NETWORK_PARSE_ERROR', httpStatus: 200 });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
