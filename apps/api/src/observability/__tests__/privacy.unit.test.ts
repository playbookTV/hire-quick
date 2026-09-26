import { describe, expect, it } from 'vitest';
import { safeError, sanitizeErrorEvent } from '../privacy.js';

describe('monitoring privacy', () => {
  it('allows diagnostic stack locations but strips payloads and source context', () => {
    const sanitized = sanitizeErrorEvent({
      type: undefined,
      event_id: 'id',
      environment: 'test',
      release: 'abc',
      message: 'secret',
      request: { url: 'secret', data: 'secret', headers: { authorization: 'secret' } },
      user: { email: 'secret' },
      breadcrumbs: [{ message: 'secret' }],
      extra: { body: 'secret' },
      tags: { code: 'RECONCILIATION_REVIEW', user: 'secret' },
      fingerprint: ['hirequick', 'RECONCILIATION_REVIEW'],
      exception: {
        values: [
          {
            type: 'Error',
            value: 'secret',
            stacktrace: {
              frames: [
                {
                  filename: 'server.ts',
                  function: 'handler',
                  lineno: 10,
                  context_line: 'secret',
                  vars: { secret: 'secret' },
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret');
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(10);
    expect(sanitized.fingerprint).toEqual(['hirequick', 'RECONCILIATION_REVIEW']);
  });
  it('keeps raw error messages and non-Error payloads out of logs', () => {
    const error = new Error('secret provider payload\nsecret second line');
    expect(JSON.stringify(safeError(error))).not.toContain('secret');
    expect(safeError({ data: 'secret' })).toEqual({ type: 'UnknownError' });
  });
});
