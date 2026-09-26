import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SmileKyc } from '../port/smile-kyc.js';
import { NoopKyc } from '../port/noop-kyc.js';
import {
  fixtureConfig,
  identity,
  jobId,
  callbackPath,
  signatureHeaders,
} from './smile-fixtures.js';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const callback = (product = 'biometric_kyc') =>
  Buffer.from(
    JSON.stringify({
      product,
      status: 'clear',
      partner_params: { job_id: jobId, user_id: 'user_fixture' },
    }),
  );

describe('Smile ID v3 boundary', () => {
  it('mints a product-scoped token with token-bound identity and a hidden per-session callback', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ token: 'short-lived-token' }));
    const reference = randomUUID();
    const result = await new SmileKyc(fixtureConfig, fetcher).startSession(
      reference,
      identity,
      '+2348000000000',
    );
    expect(result).toEqual({
      referenceId: reference,
      token: 'short-lived-token',
      partnerId: '1234',
      sandbox: true,
      privacyPolicyUrl: fixtureConfig.privacyPolicyUrl,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://testapi.smileidentity.com/v3/token');
    expect(init?.headers).toEqual({
      'SmileID-Partner-ID': '1234',
      'SmileID-API-Key': fixtureConfig.apiKey,
    });
    const body = init?.body as FormData;
    expect(body.get('product')).toBe('biometric_kyc');
    expect(JSON.parse(String(body.get('payload')))).toMatchObject({
      country: 'NG',
      id_type: 'NIN_V2',
      id_number: identity.idNumber,
      callback_url: `https://api.example.com${callbackPath(reference)}`,
    });
    expect(JSON.stringify(result)).not.toContain(fixtureConfig.apiKey);
    expect(JSON.stringify(result)).not.toContain(identity.idNumber);
    expect(JSON.stringify(result)).not.toContain(callbackPath(reference));
  });
  it('uses the production endpoint and maps BVN correctly', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ token: 'token' }));
    await new SmileKyc({ ...fixtureConfig, environment: 'production' }, fetcher).startSession(
      randomUUID(),
      { ...identity, idType: 'BVN' },
      '+2348000000000',
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.smileidentity.com/v3/token');
    expect(
      JSON.parse(String((fetcher.mock.calls[0]?.[1]?.body as FormData).get('payload'))).id_type,
    ).toBe('BVN');
    expect(
      JSON.parse(String((fetcher.mock.calls[0]?.[1]?.body as FormData).get('payload'))).phone_number,
    ).toBe('+2348000000000');
  });
  it('binds the sandbox identity email without exposing it in the mobile session', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ token: 'token' }));
    const email = 'amina.clearwater@example.com';
    const result = await new SmileKyc(fixtureConfig, fetcher).startSession(
      randomUUID(),
      { ...identity, givenNames: 'Amina Fatou', lastName: 'Clearwater', email },
      '+2348000000000',
    );
    const payload = JSON.parse(String((fetcher.mock.calls[0]?.[1]?.body as FormData).get('payload')));
    expect(payload).toMatchObject({ given_names: 'Amina Fatou', last_name: 'Clearwater', email });
    expect(payload.phone_number).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(email);
  });
  it.each([{}, { token: '' }])('fails closed for malformed token replies', async (body) => {
    await expect(
      new SmileKyc(fixtureConfig, async () => json(body)).startSession(
        randomUUID(),
        identity,
        '+2348000000000',
      ),
    ).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
  });
  it('rejects missing/wrong signatures, capabilities, wrong products and malformed bodies', () => {
    const kyc = new SmileKyc(fixtureConfig);
    const ref = randomUUID();
    const key = callbackPath(ref).split('/').at(-1)!;
    expect(kyc.verifyWebhook(callback(), signatureHeaders, ref, key)).toEqual({
      referenceId: ref,
      jobId,
      userId: 'user_fixture',
    });
    expect(kyc.verifyWebhook(callback(), {}, ref, key)).toBeNull();
    expect(
      kyc.verifyWebhook(callback(), { ...signatureHeaders, 'response-signature': 'bad' }, ref, key),
    ).toBeNull();
    expect(kyc.verifyWebhook(callback(), signatureHeaders, ref, 'bad')).toBeNull();
    expect(kyc.verifyWebhook(callback(), signatureHeaders, randomUUID(), key)).toBeNull();
    expect(
      kyc.verifyWebhook(callback('smart_selfie_registration'), signatureHeaders, ref, key),
    ).toBeNull();
    expect(kyc.verifyWebhook(Buffer.from('invalid'), signatureHeaders, ref, key)).toBeNull();
  });
  it.each([
    ['clear', 'verified'],
    ['block', 'rejected'],
    ['attention', 'pending'],
    ['error', 'pending'],
    ['processing', 'pending'],
    ['unknown', 'pending'],
  ])('maps authoritative %s to %s', async (status, decision) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ token: 'status-token' }))
      .mockResolvedValueOnce(json({ status, job_id: jobId, user_id: 'user_fixture' }));
    const result = await new SmileKyc(fixtureConfig, fetcher).getResult(jobId, 'user_fixture');
    expect(result).toMatchObject({ decision, providerJobId: jobId, providerStatus: status });
    expect(fetcher.mock.calls[1]?.[0]).toBe(`https://testapi.smileidentity.com/v3/status/${jobId}`);
    // No invented liveness, watchlist or face-score evidence from a summary status.
    expect(result.faceMatchScore).toBeUndefined();
    expect(result.watchListed).toBeUndefined();
  });
  it.each(['job', 'user', 'unavailable', 'malformed'])(
    'retries callbacks for %s status failures',
    async (failure) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ token: 'status-token' }))
        .mockResolvedValueOnce(
          json(
            failure === 'malformed'
              ? {}
              : {
                  status: 'clear',
                  job_id: failure === 'job' ? 'another-job' : jobId,
                  user_id: failure === 'user' ? 'other-user' : 'user_fixture',
                },
            failure === 'unavailable' ? 503 : 200,
          ),
        );
      await expect(
        new SmileKyc(fixtureConfig, fetcher).getResult(jobId, 'user_fixture'),
      ).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
    },
  );
  it('never approves when unconfigured', async () => {
    const noop = new NoopKyc();
    await expect(noop.startSession('reference')).rejects.toMatchObject({ code: 'KYC_UNAVAILABLE' });
    expect(await noop.getResult('reference')).toEqual({ decision: 'pending' });
    expect(noop.verifyWebhook()).toBeNull();
  });
});
