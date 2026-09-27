import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { smileSubmissionDetails, smileSubmissionInterceptor } from '../smile-submission-monitoring.js';

// Exercise the actual Axios interceptor chain and installed SDK refresh logic.
const require = createRequire(import.meta.url);
const sdkEntry = require.resolve('@smileid/usesmileid');
const axios = createRequire(sdkEntry)('axios');
const sdkModule = (path: string) => import(pathToFileURL(join(dirname(sdkEntry), path)).href);
const valid = { job_id: 'job-test', user_id: 'user-test', status: 'pending', message: 'private-response' };

describe('Smile submission diagnostics', () => {
  it.each([[401, 'NETWORK_UNAUTHORIZED'], [403, 'NETWORK_FORBIDDEN'], [404, 'NETWORK_NOT_FOUND'], [429, 'NETWORK_RATE_LIMIT'], [503, 'NETWORK_SERVER_ERROR']])('reports HTTP %s immediately and rethrows the original error', async (status, sdkError) => {
    const error = { isAxiosError: true, response: { status, data: { token: 'secret', name: 'secret' } }, config: { headers: { authorization: 'secret' } } };
    const client = axios.create({ adapter: async () => { throw error; } }); const send = vi.fn();
    smileSubmissionInterceptor(send).attach(client);
    await expect(client.post('/v3/biometric_kyc', 'secret')).rejects.toBe(error);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ sdkError, httpStatus: status });
    expect(JSON.stringify(send.mock.calls)).not.toContain('secret');
  });
  it('reports malformed 2xx responses without changing the SDK response', async () => {
    const response = { data: { token: 'secret' }, status: 200, headers: {}, config: {} };
    const client = axios.create({ adapter: async () => response }); const send = vi.fn();
    smileSubmissionInterceptor(send).attach(client);
    expect(await client.post('/v3/biometric_kyc')).toBe(response);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ sdkError: 'NETWORK_PARSE_ERROR', httpStatus: 200 });
  });
  it('leaves a valid response untouched and does not report success', async () => {
    const response = { data: valid, status: 202, headers: {}, config: {} };
    const client = axios.create({ adapter: async () => response }); const send = vi.fn();
    smileSubmissionInterceptor(send).attach(client);
    expect(await client.post('/v3/biometric_kyc')).toBe(response);
    expect(send).not.toHaveBeenCalled();
  });
  it('allows the SDK to recover a 401 before reporting', async () => {
    const { TokenRefreshInterceptor } = await sdkModule('data/api/interceptors/token_refresh_interceptor.js');
    const { TokenHolder } = await sdkModule('data/api/auth/token_holder.js');
    let calls = 0; const send = vi.fn(); const refresh = vi.fn(async () => 'fresh-token');
    const client = axios.create({ adapter: async (config: object) => {
      if (++calls === 1) throw { isAxiosError: true, response: { status: 401 }, config };
      return { data: valid, status: 200, headers: {}, config };
    } });
    new TokenRefreshInterceptor({ tokenHolder: new TokenHolder('old-token'), onTokenExpired: refresh }).attach(client);
    smileSubmissionInterceptor(send).attach(client);
    await expect(client.post('/v3/biometric_kyc')).resolves.toMatchObject({ data: valid });
    expect(refresh).toHaveBeenCalledOnce(); expect(calls).toBe(2); expect(send).not.toHaveBeenCalled();
  });
  it('cannot swallow an error when telemetry itself fails', async () => {
    const error = { isAxiosError: true, code: 'ECONNABORTED' };
    const client = axios.create({ adapter: async () => { throw error; } });
    smileSubmissionInterceptor(() => { throw new Error('telemetry offline'); }).attach(client);
    await expect(client.post('/v3/biometric_kyc')).rejects.toBe(error);
    expect(smileSubmissionDetails(error)).toEqual({ sdkError: 'NETWORK_TIMEOUT' });
    expect(smileSubmissionDetails({ errorCode: 'secret', statusCode: 'secret' })).toEqual({});
  });
});
