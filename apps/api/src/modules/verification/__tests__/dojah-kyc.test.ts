import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { DojahKyc } from '../port/dojah-kyc.js';
import { NoopKyc } from '../port/noop-kyc.js';

const config = { appId: 'fixture-app', secretKey: 'fixture-secret', widgetId: 'fixture-widget' };
const passed = () => ({
  reference_id: 'fixture-reference',
  verification_status: 'Completed',
  status: true,
  data: {
    government_data: { status: true, data: { nin: { entity: { nin: '12345678901' } } } },
    selfie: { status: true, data: { match_score: 90 } },
  },
});
function signed(payload: unknown) {
  const raw = Buffer.from(JSON.stringify(payload));
  return {
    raw,
    headers: {
      'x-dojah-signature': createHmac('sha256', config.secretKey).update(raw).digest('hex'),
    },
  };
}
function parse(payload: unknown) {
  const { raw, headers } = signed(payload);
  return new DojahKyc(config).verifyWebhook(raw, headers);
}

describe('Dojah authentication and authoritative results', () => {
  it('accepts documented signed bytes and rejects a tampered body', () => {
    const { raw, headers } = signed(passed());
    const api = new DojahKyc(config);
    expect(api.verifyWebhook(raw, headers)?.result.decision).toBe('verified');
    expect(api.verifyWebhook(Buffer.concat([raw, Buffer.from(' ')]), headers)).toBeNull();
  });
  it.each([undefined, '', 'x', 'z'.repeat(64), '0'.repeat(64), ['0'.repeat(64)]])(
    'rejects missing/malformed/invalid authentication %j',
    (signature) => {
      expect(
        new DojahKyc(config).verifyWebhook(signed(passed()).raw, {
          'x-dojah-signature': signature,
        }),
      ).toBeNull();
    },
  );
  it('rejects the undocumented alias and secret-only signature without body authentication', () => {
    const { raw, headers } = signed(passed());
    expect(
      new DojahKyc(config).verifyWebhook(raw, { 'x-dojah-hmac': headers['x-dojah-signature'] }),
    ).toBeNull();
    expect(
      new DojahKyc(config).verifyWebhook(raw, {
        'x-dojah-signature-v2': headers['x-dojah-signature'],
      }),
    ).toBeNull();
  });
  it.each([null, [], {}, { reference_id: '' }])(
    'rejects malformed signed payload %j',
    (payload) => {
      expect(parse(payload)).toBeNull();
    },
  );
  it.each(['Pending', 'Ongoing', 'Abandoned', 'unknown'])(
    'never approves %s using partial positive signals',
    (status) => {
      expect(parse({ ...passed(), verification_status: status })?.result.decision).toBe('pending');
    },
  );
  it('does not equate completed with passed', () => {
    expect(parse({ ...passed(), status: false })?.result.decision).toBe('rejected');
    expect(parse({ ...passed(), aml: { status: false } })?.result.decision).toBe('rejected');
    expect(
      parse({ ...passed(), data: { ...passed().data, address: { status: false } } })?.result
        .decision,
    ).toBe('rejected');
  });
  it('rejects documented failed verification and liveness/face/ID failures', () => {
    expect(parse({ ...passed(), verification_status: 'Failed' })?.result.decision).toBe('rejected');
    const payload = passed();
    payload.data.selfie.status = false;
    expect(parse(payload)?.result.reasonCode).toBe('LIVENESS_FAILED');
    payload.data.selfie.status = true;
    payload.data.selfie.data.match_score = 20;
    expect(parse(payload)?.result.reasonCode).toBe('SELFIE_MISMATCH');
    payload.data.government_data.status = false;
    expect(parse(payload)?.result.reasonCode).toBe('ID_NOT_FOUND');
  });
  it('leaves missing identity/face-match evidence for review', () => {
    expect(
      parse({
        ...passed(),
        data: { ...passed().data, selfie: { status: true, data: { match_score: null } } },
      })?.result.decision,
    ).toBe('pending');
    const payload = passed();
    payload.data.government_data.data.nin.entity.nin = '';
    expect(parse(payload)?.result.decision).toBe('pending');
  });
  it('does not expose raw identity payloads or government photos in the adapter result', () => {
    expect(parse(passed())?.result).not.toHaveProperty('raw');
    expect(parse(passed())?.result).not.toHaveProperty('govPhotoBase64');
  });
  it('verifies the lookup reference, documented URL and bounded request', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(passed())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...passed(), reference_id: 'someone-else' })),
      );
    const api = new DojahKyc(config, fetcher);
    expect((await api.getResult('fixture-reference')).decision).toBe('verified');
    expect((await api.getResult('fixture-reference')).decision).toBe('pending');
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.dojah.io/api/v1/kyc/verification?reference_id=fixture-reference',
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: config.secretKey,
      AppId: config.appId,
    });
  });
  it.each(['network', 'http', 'json'])(
    'keeps unavailable %s lookup evidence pending',
    async (kind) => {
      const fetcher = vi.fn<typeof fetch>();
      if (kind === 'network') fetcher.mockRejectedValue(new Error('network'));
      else if (kind === 'http') fetcher.mockResolvedValue(new Response('{}', { status: 500 }));
      else fetcher.mockResolvedValue(new Response('invalid-json'));
      expect(await new DojahKyc(config, fetcher).getResult('fixture-reference')).toEqual({
        decision: 'pending',
      });
    },
  );
  it('unconfigured provider rejects callbacks and refuses to create fake sessions', async () => {
    const api = new NoopKyc();
    expect(api.verifyWebhook()).toBeNull();
    await expect(api.startSession('reference')).rejects.toMatchObject({
      statusCode: 503,
      code: 'KYC_UNAVAILABLE',
    });
  });
});
