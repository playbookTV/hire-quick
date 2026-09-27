import { createHmac } from 'node:crypto';
import type { KycIdentity } from '../port/kyc-port.js';
export const fixtureConfig = {
  partnerId: '1234',
  apiKey: 'smile-unit-secret',
  environment: 'sandbox' as const,
  callbackUrl: 'https://api.example.com/webhooks/smile-id',
  privacyPolicyUrl: 'https://example.com/privacy',
};
export const identity: KycIdentity = {
  idType: 'NIN',
  idNumber: '12345678901',
  givenNames: 'Test',
  lastName: 'Person',
};
export const jobId = 'job_01m326p53pe1ztjdxh2d9jn9ck';
export const timestamp = '2026-09-23T12:00:00.000Z';
export const signatureHeaders = {
  'response-timestamp': timestamp,
  'response-signature': createHmac('sha256', fixtureConfig.apiKey)
    .update(timestamp + fixtureConfig.partnerId + 'sid_request')
    .digest('base64'),
};
export function callbackPath(reference: string) {
  const key = createHmac('sha256', fixtureConfig.apiKey)
    .update(`hirequick:smile-callback:${reference}`)
    .digest('hex');
  return `/webhooks/smile-id/${reference}/${key}`;
}
export const providerFetch: typeof fetch = async (url) =>
  new Response(
    JSON.stringify(
      String(url).endsWith('/v3/token')
        ? { token: 'fixture-token' }
        : { job_id: jobId, user_id: 'user_fixture', status: 'clear' },
    ),
    { status: 200 },
  );
