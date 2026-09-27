import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import {
  cacheReviewEvidence,
  hasReviewPhotos,
  parseReviewEvidence,
  readReviewEvidence,
} from '../evidence.js';
import { SmileKyc } from '../port/smile-kyc.js';
import { fixtureConfig, jobId } from './smile-fixtures.js';
import { randomUUID } from 'node:crypto';
const input = {
  status: 'attention',
  image_links: { selfie_image: 'https://smile-results.s3.eu-west-1.amazonaws.com/selfie.jpg' },
  id_fields: {
    full_name: 'Test Person',
    id_number: '12345678901',
    photo_url: 'https://smile-results.s3.eu-west-1.amazonaws.com/id.jpg',
  },
};
describe('Admin review evidence boundary', () => {
  it('only accepts provider media and never mistakes one image for sufficient evidence', () => {
    expect(hasReviewPhotos(parseReviewEvidence(input)!)).toBe(true);
    for (const url of [
      'javascript:alert(1)',
      'https://attacker.example/photo',
      'http://smile-results.s3.eu-west-1.amazonaws.com/photo',
      'https://smile-results.s3.eu-west-1.amazonaws.com.attacker.example/photo',
    ]) {
      const evidence = parseReviewEvidence({ ...input, image_links: { selfie_image: url } })!;
      expect(evidence.selfieUrl).toBeNull();
      expect(hasReviewPhotos(evidence)).toBe(false);
    }
  });
  it('does not extend an expired media signature or fail the callback on a malformed date', () => {
    for (const date of ['20200101T000000Z', '20269999T999999Z']) {
      const evidence = parseReviewEvidence({
        ...input,
        image_links: {
          selfie_image: `https://smile-results.s3.eu-west-1.amazonaws.com/selfie.jpg?X-Amz-Date=${date}&X-Amz-Expires=900`,
        },
      })!;
      expect(Date.parse(evidence.expiresAt)).toBeLessThan(Date.now());
    }
  });
  it('binds evidence to the authenticated job and authoritative status, then expires it', async () => {
    const store = new Map<string, string>();
    const set = vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    });
    const redis = { set, get: async (key: string) => store.get(key) ?? null } as unknown as Redis;
    const referenceId = randomUUID();
    const evidence = parseReviewEvidence(input)!;
    const webhook = { referenceId, jobId, userId: 'user_fixture', evidence };
    await cacheReviewEvidence(redis, webhook, {
      decision: 'pending',
      providerJobId: jobId,
      providerStatus: 'clear',
    });
    expect(set).not.toHaveBeenCalled();
    await cacheReviewEvidence(redis, webhook, {
      decision: 'pending',
      providerJobId: jobId,
      providerStatus: 'attention',
    });
    expect(set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 600);
    expect(await readReviewEvidence(redis, referenceId, 'wrong-job')).toBeNull();
    expect(await readReviewEvidence(redis, 'wrong-reference', jobId)).toBeNull();
    expect(await readReviewEvidence(redis, referenceId, jobId)).toEqual(evidence);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(evidence.expiresAt) + 1);
    try {
      expect(await readReviewEvidence(redis, referenceId, jobId)).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('requests fresh evidence with the server-owned callback and rejects environment changes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"token":"token"}'))
      .mockResolvedValueOnce(new Response('{"status":"accepted"}'));
    const kyc = new SmileKyc(fixtureConfig, fetcher);
    const reference = randomUUID();
    await expect(kyc.refreshEvidence(jobId, reference, 'production')).rejects.toMatchObject({
      code: 'KYC_ENVIRONMENT_MISMATCH',
    });
    expect(fetcher).not.toHaveBeenCalled();
    await kyc.refreshEvidence(jobId, reference, 'sandbox');
    expect(fetcher.mock.calls[1]?.[0]).toBe(`https://testapi.smileidentity.com/v3/replay/${jobId}`);
    expect(String((fetcher.mock.calls[1]?.[1]?.body as FormData).get('callback_url'))).toContain(
      `/webhooks/smile-id/${reference}/`,
    );
  });
});
