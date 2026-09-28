import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { SmileKyc } from '../../modules/verification/port/smile-kyc.js';
import { tagSmileError } from '../smile.js';
import { reportError } from '../reporting.js';
import { sanitizeErrorEvent } from '../privacy.js';
import { sanitizeAdminEvent } from '../../../../admin/src/lib/monitoring-privacy.js';

afterEach(async () => { vi.restoreAllMocks(); await Sentry.close(1000); });
describe('Smile provider fault reporting', () => {
  it('reports an upstream token rejection with a safe code, never the upstream body or identity', async () => {
    const events: unknown[] = [];
    Sentry.init({ dsn: 'https://public@example.com/1', defaultIntegrations: false,
      beforeSend: sanitizeErrorEvent, transport: () => ({
        send: async (envelope) => { events.push(envelope); return { statusCode: 200 }; },
        flush: async () => true,
      }),
    });
    const kyc = new SmileKyc({ partnerId: 'test', apiKey: 'secret', environment: 'sandbox',
      callbackUrl: 'https://api.example/callback', privacyPolicyUrl: 'https://example/privacy' },
      vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream identity', { status: 503 })));
    const failure = await kyc.startSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      { idType: 'NIN', idNumber: '12345678901', givenNames: 'Secret', lastName: 'Person' }, 'secret-phone')
      .catch((error: unknown) => error);
    // A route-level catch must not overwrite the provider's precise stage/reference.
    if (failure instanceof Error) tagSmileError(failure, 'SMILE_CALLBACK_FAILED');
    reportError(failure, { code: 'KYC_UNAVAILABLE' });
    await Sentry.flush(1000);
    const serialized = JSON.stringify(events);
    expect(serialized).toContain('SMILE_SESSION_FAILED');
    expect(serialized).toContain('"value":"SMILE_SESSION_FAILED"');
    expect(serialized).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('12345678901');
    expect(serialized).not.toContain('SMILE_CALLBACK_FAILED');
    reportError(tagSmileError(new Error('Callback database connection failed'), 'SMILE_CALLBACK_FAILED'), { code: 'INTERNAL' });
    await Sentry.flush(1000);
    expect(JSON.stringify(events)).toContain('SMILE_CALLBACK_FAILED');
    // Smile's reporter emits a fixed code; the event filter now preserves that text.
    expect(JSON.stringify(events)).toContain('"value":"SMILE_CALLBACK_FAILED"');
  });
  it('retains the safe diagnostic through API and admin sanitizers while removing sensitive context', () => {
    const event = { type: undefined, message: 'Evidence request failed', request: { url: 'secret' },
      exception: { values: [{ type: 'Error', value: 'Evidence storage is unavailable' }] },
      user: { email: 'secret' }, extra: { idNumber: 'secret' }, breadcrumbs: [{ message: 'secret' }],
      tags: { code: 'SMILE_ADMIN_EVIDENCE_FAILED', attempt: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'secret' } };
    for (const sanitize of [sanitizeErrorEvent, sanitizeAdminEvent]) {
      const safe = sanitize(event);
      expect(safe.tags?.code).toBe('SMILE_ADMIN_EVIDENCE_FAILED');
      expect(safe.tags?.attempt).toBe(event.tags.attempt);
      expect(safe.message).toBe('Evidence request failed');
      expect(safe.exception?.values?.[0]?.value).toBe('Evidence storage is unavailable');
      expect(JSON.stringify(safe)).not.toContain('secret');
    }
  });
});
