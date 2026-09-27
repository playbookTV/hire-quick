import { describe, expect, it, vi, beforeEach } from 'vitest';
import SmileCapture from '../../components/SmileCapture.native.js';
import { reportSmile } from '../monitoring.js';
import { startKyc } from '../kyc.js';

vi.mock('../monitoring.js', () => ({ reportSmile: vi.fn() }));
vi.mock('../kyc.js', () => ({ startKyc: vi.fn() }));
vi.mock('react-native', () => ({ Text: 'Text' }));
vi.mock('@smileid/usesmileid', () => ({ UseSmileIDBuilder: 'Builder', JobType: { biometricKyc: 1 }, CaptureType: { selfie: 1 } }));
vi.mock('../smile-providers.js', () => ({ faceAnalyzer: {} }));

const attempt = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
beforeEach(() => vi.clearAllMocks());
describe('native Smile SDK callbacks', () => {
  function capture() {
    const callbacks = { onFailure: vi.fn(), onCancelled: vi.fn(), onSubmitted: vi.fn() };
    const element = SmileCapture({ session: { referenceId: attempt, token: 'secret', partnerId: 'partner', sandbox: true, privacyPolicyUrl: 'https://example.com' },
      identity: { idType: 'NIN', idNumber: '12345678901', givenNames: 'Private', lastName: 'Person' }, ...callbacks });
    const network: { onTokenExpired?: () => Promise<string> } = {};
    const interceptors: Array<{ attach: (client: unknown) => void }> = [];
    // A fluent builder probe calls the production callbacks without starting a camera.
    const builder: Record<string, unknown> = {};
    const chain: () => unknown = new Proxy(() => undefined, { get: () => chain, apply: (_t, _this, args: unknown[]) => {
      if (typeof args[0] === 'function') (args[0] as (b: unknown) => void)(chain);
      return chain;
    } });
    builder.config = (fn: (b: object) => void) => fn({});
    builder.network = (fn: (b: object) => void) => fn({
      config: (configure: (n: object) => void) => configure(Object.assign(network, { partnerConfig: () => undefined })),
      interceptors: (configure: (i: object) => void) => configure({ add: (interceptor: { attach: (client: unknown) => void }) => interceptors.push(interceptor) }),
    });
    builder.ml = (fn: (b: unknown) => void) => fn(chain);
    builder.screens = (fn: (b: unknown) => void) => fn(chain);
    (element.props as { builder: (b: unknown) => void }).builder(builder);
    return { callbacks, network, interceptors, result: builder.onResult as (result: object) => void };
  }
  it('reports rejected submission before Exit without changing the SDK error', async () => {
    const { interceptors, callbacks } = capture();
    expect(interceptors).toHaveLength(1);
    let rejected: (error: unknown) => unknown = () => undefined;
    interceptors[0]!.attach({ interceptors: { response: { use: (_ok: unknown, fail: typeof rejected) => { rejected = fail; } } } });
    const error = { isAxiosError: true, response: { status: 403, data: { name: 'Private', token: 'secret' } } };
    await expect(Promise.resolve().then(() => rejected(error))).rejects.toBe(error);
    expect(reportSmile).toHaveBeenCalledWith('SMILE_CAPTURE_FAILED', attempt, { sdkError: 'NETWORK_FORBIDDEN', httpStatus: 403 });
    expect(callbacks.onFailure).not.toHaveBeenCalled();
  });
  it('reports handled SDK failures but not successful capture or cancellation', () => {
    const { result, callbacks } = capture();
    result({ status: 'cancelled' }); result({ status: 'success' });
    expect(reportSmile).not.toHaveBeenCalled();
    result({ status: 'error', token: 'secret', message: 'private identity' });
    expect(reportSmile).toHaveBeenCalledWith('SMILE_CAPTURE_FAILED', attempt, {});
    expect(callbacks.onFailure).toHaveBeenCalledOnce();
    expect(callbacks.onSubmitted).toHaveBeenCalledOnce();
    expect(callbacks.onCancelled).toHaveBeenCalledOnce();
  });
  it('reports token-refresh failure without swallowing the SDK retry error', async () => {
    const { network } = capture();
    const error = new Error('secret'); vi.mocked(startKyc).mockRejectedValue(error);
    await expect(network.onTokenExpired!()).rejects.toBe(error);
    expect(reportSmile).toHaveBeenCalledWith('SMILE_TOKEN_REFRESH_FAILED', attempt);
  });
});
