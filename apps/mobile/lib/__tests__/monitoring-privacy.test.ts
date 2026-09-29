import { describe, expect, it } from 'vitest';
import { sanitizeMobileEvent } from '../monitoring-privacy.js';

describe('mobile crash event privacy', () => {
  it('keeps a Smile failure searchable without exposing the capture payload', () => {
    const safe = sanitizeMobileEvent({ type: undefined, message: 'Capture submission rejected with HTTP 403',
      tags: { code: 'SMILE_CAPTURE_FAILED', attempt: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'secret', sdk_error: 'NETWORK_FORBIDDEN', http_status: '403' },
      extra: { result: 'secret' }, request: { data: 'secret' } });
    expect(safe.message).toBe('Capture submission rejected with HTTP 403');
    expect(safe.tags?.stage).toBe('capture_submission');
    expect(safe.tags?.sdk_error).toBe('NETWORK_FORBIDDEN');
    expect(safe.tags?.http_status).toBe('403');
    expect(safe.fingerprint).toEqual(['hirequick', 'SMILE_CAPTURE_FAILED']);
    expect(JSON.stringify(safe)).not.toContain('secret');
  });
  it('removes customer data while preserving source-map and native symbol identifiers', () => {
    const result = sanitizeMobileEvent({
      type: undefined,
      release: 'com.hirequick.mobile@0.0.1+42',
      dist: '42',
      environment: 'preview',
      debug_meta: {
        images: [
          { type: 'sourcemap', code_file: 'app:///index.android.bundle', debug_id: 'map-id' },
        ],
      },
      message: 'Profile screen failed to render',
      user: { email: 'secret' },
      request: { data: 'secret', url: 'secret' },
      breadcrumbs: [{ message: 'secret' }],
      extra: { otp: 'secret' },
      contexts: { device: { name: 'secret' } },
      tags: { phone: 'secret' },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'Cannot read properties of undefined',
            mechanism: { type: 'generic', handled: false, data: { body: 'secret' } },
            stacktrace: {
              frames: [
                {
                  filename: 'index.android.bundle',
                  lineno: 12,
                  colno: 34,
                  vars: { otp: 'secret' },
                  context_line: 'secret',
                },
              ],
            },
          },
        ],
      },
      threads: {
        values: [
          {
            id: 1,
            name: 'secret',
            crashed: true,
            stacktrace: { frames: [{ instruction_addr: '0x1234', vars: { token: 'secret' } }] },
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.message).toBe('Profile screen failed to render');
    expect(result.exception?.values?.[0]?.value).toBe('Cannot read properties of undefined');
    expect(result.release).toBe('com.hirequick.mobile@0.0.1+42');
    expect(result.debug_meta?.images?.[0]?.debug_id).toBe('map-id');
    expect(result.exception?.values?.[0]?.mechanism?.handled).toBe(false);
    expect(result.exception?.values?.[0]?.stacktrace?.frames?.[0]).toMatchObject({
      lineno: 12,
      colno: 34,
    });
    expect(result.threads?.values[0]?.stacktrace?.frames?.[0]?.instruction_addr).toBe('0x1234');
  });

  it('accepts events without exception, thread, or source-map metadata', () => {
    expect(sanitizeMobileEvent({ type: undefined })).toEqual({
      type: undefined,
      tags: { service: 'hirequick-mobile' },
    });
  });
});
