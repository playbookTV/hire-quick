/**
 * Live R2 round-trip (TRD §14): presigned PUT → GET → delete against the real
 * bucket. Skipped automatically when STORAGE_* is unconfigured.
 */
import { describe, it, expect } from 'vitest';
import { createStorageFromEnv } from '../storage.js';
import { env } from '../../../env.js';

const storage = createStorageFromEnv(env);

describe.skipIf(!storage)('R2 storage round-trip', () => {
  it('presigned PUT then GET returns the same bytes, then delete removes it', async () => {
    const s = storage!;
    const key = `verifications/_selftest/roundtrip-${Date.now()}.txt`;
    const body = `hq-compliance-${Date.now()}`;

    const putUrl = await s.presignUpload(key, 'text/plain');
    const put = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body });
    expect(put.ok).toBe(true);

    const getUrl = await s.presignDownload(key, 60);
    const got = await fetch(getUrl);
    expect(got.ok).toBe(true);
    expect(await got.text()).toBe(body);

    await s.deleteObject(key);
    const afterDelete = await fetch(await s.presignDownload(key, 60));
    expect(afterDelete.status).toBe(404);
  });
});
