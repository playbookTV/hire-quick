import { describe, expect, it, vi } from 'vitest';
import { createCheckoutController, createCheckoutScopeFence, type CheckoutStorage } from '../../../../../mobile/lib/checkout.js';
import { checkoutStorage } from '../../../../../mobile/lib/checkout-storage.js';
import { ApiError } from '../../../../../mobile/lib/api-error.js';

const eventId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';
const bookingId = '44444444-4444-4444-8444-444444444444';
const input = { applicationIds: [applicationId], email: 'client@example.com' };
const response = { orderId, eventId, bookingIds: [bookingId], reference: `hq-${orderId}`, state: 'READY', authorizationUrl: 'https://checkout.paystack.com/original', expiresAt: '2030-01-01T00:00:00.000Z', amountKobo: 10000, duplicate: false };
function fixture() {
  const data = new Map<string, string>();
  const storage: CheckoutStorage = {
    read: vi.fn((key) => Promise.resolve(data.get(key) ?? null)),
    write: vi.fn((key, value) => { data.set(key, value); return Promise.resolve(); }),
    remove: vi.fn((key) => { data.delete(key); return Promise.resolve(); }),
  };
  const transport = { confirm: vi.fn(async () => response), resume: vi.fn(async () => response), status: vi.fn(async () => response) };
  const key = vi.fn(() => 'idempotency-original');
  const make = () => createCheckoutController(storage, transport, key);
  return { data, storage, transport, make, controller: make(), key };
}
describe('persisted mobile checkout', () => {
  it('invalidates delayed UI/browser/navigation effects after user/event switch or unmount', () => {
    const fence = createCheckoutScopeFence();
    fence.activate('user-a:event-a');
    const old = fence.capture();
    fence.activate('user-b:event-a');
    expect(old()).toBe(false);
    const next = fence.capture();
    fence.activate('user-b:event-b');
    expect(next()).toBe(false);
    const mounted = fence.capture();
    fence.invalidate();
    expect(mounted()).toBe(false);
    fence.activate('user-b:event-b');
    expect(mounted()).toBe(false);
    expect(fence.capture()()).toBe(true);
  });
  it('process restart/browser cancellation resumes the same order and URL without confirming again', async () => {
    const f = fixture();
    const first = await f.controller.submit('user-a', eventId, input);
    // Browser cancellation intentionally has no store mutation or key rotation.
    const reopened = f.make();
    expect((await reopened.load('user-a', eventId))?.outcome?.orderId).toBe(first.orderId);
    expect((await reopened.submit('user-a', eventId, input)).authorizationUrl).toBe(first.authorizationUrl);
    expect(f.transport.confirm).toHaveBeenCalledTimes(1);
    expect(f.transport.resume).toHaveBeenCalledWith(orderId);
    expect(f.key).toHaveBeenCalledTimes(1);
  });
  it('lost confirmation response retains key and exact input across restart', async () => {
    const f = fixture();
    f.transport.confirm.mockRejectedValueOnce(new Error('response lost'));
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow();
    await f.make().submit('user-a', eventId, input);
    expect(f.transport.confirm.mock.calls).toEqual([[eventId, input, 'idempotency-original'], [eventId, input, 'idempotency-original']]);
  });
  it('blocks changed input and simultaneous double submit while preserving the first intent', async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    f.transport.confirm.mockImplementationOnce(async () => { await gate; return response; });
    const first = f.controller.submit('user-a', eventId, input);
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow('already in progress');
    release(); await first;
    await expect(f.controller.submit('user-a', eventId, { ...input, email: 'changed@example.com' })).rejects.toThrow('saved checkout');
    expect(f.transport.confirm).toHaveBeenCalledTimes(1);
  });
  it('storage failure before checkpoint prevents API dispatch', async () => {
    const f = fixture();
    vi.mocked(f.storage.write).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow('storage');
    expect(f.transport.confirm).not.toHaveBeenCalled();
  });
  it('receipt persistence failure retries original confirm instead of creating another key', async () => {
    const f = fixture();
    vi.mocked(f.storage.write).mockImplementationOnce(async (key, value) => { f.data.set(key, value); }).mockRejectedValueOnce(new Error('storage failed'));
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow('storage');
    await f.make().submit('user-a', eventId, input);
    expect(f.transport.confirm.mock.calls[1]).toEqual(f.transport.confirm.mock.calls[0]);
    expect(f.key).toHaveBeenCalledTimes(1);
  });
  it('new caller cannot read the old caller intent and logout-related retry403 does not discard it', async () => {
    const f = fixture();
    f.transport.confirm.mockRejectedValueOnce(new Error('session changed'));
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow();
    expect(await f.controller.load('user-b', eventId)).toBeNull();
    f.transport.confirm.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'session expired'));
    await expect(f.make().submit('user-a', eventId, input)).rejects.toThrow();
    expect((await f.controller.load('user-a', eventId))?.key).toBe('idempotency-original');
  });
  it('only an explicit first-attempt pre-acceptance rejection clears an unaccepted intent', async () => {
    const f = fixture();
    f.transport.confirm.mockRejectedValueOnce(new ApiError(409, 'SELECTION_CHANGED', 'changed'));
    await expect(f.controller.submit('user-a', eventId, input)).rejects.toThrow();
    expect(await f.controller.load('user-a', eventId)).toBeNull();
  });
  it('rejects rotated reference or order on refresh while retaining original receipt', async () => {
    const f = fixture();
    await f.controller.submit('user-a', eventId, input);
    f.transport.status.mockResolvedValueOnce({ ...response, reference: 'different-charge' });
    await expect(f.controller.refresh('user-a', eventId)).rejects.toThrow('saved order');
    expect((await f.controller.load('user-a', eventId))?.outcome?.reference).toBe(response.reference);
  });
  it('acknowledgment requires a matching terminal receipt and failed deletion keeps it', async () => {
    const f = fixture();
    await f.controller.submit('user-a', eventId, input);
    await expect(f.controller.acknowledge('user-a', eventId, orderId)).rejects.toThrow('unresolved');
    f.transport.status.mockResolvedValueOnce({ ...response, state: 'PAID' });
    await f.controller.refresh('user-a', eventId);
    await expect(f.controller.acknowledge('user-a', eventId, bookingId)).rejects.toThrow();
    vi.mocked(f.storage.remove).mockRejectedValueOnce(new Error('delete failed'));
    await expect(f.controller.acknowledge('user-a', eventId, orderId)).rejects.toThrow();
    expect(await f.controller.load('user-a', eventId)).not.toBeNull();
    await f.controller.acknowledge('user-a', eventId, orderId);
    expect(await f.controller.load('user-a', eventId)).toBeNull();
  });
});

describe('native checkout checkpoint chunks', () => {
  function keychainFixture() {
    const data = new Map<string, string>();
    const native = {
      getItemAsync: vi.fn(async (key: string) => data.get(key) ?? null),
      setItemAsync: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
      deleteItemAsync: vi.fn(async (key: string) => { data.delete(key); }),
    };
    let n = 0;
    return { data, native, make: () => checkoutStorage(native, () => `revision_${++n}`) };
  }
  it('persists a large selection within per-value limits and restores after restart', async () => {
    const f = keychainFixture();
    const value = 'x'.repeat(9000);
    await f.make().write('scope', value);
    expect(await f.make().read('scope')).toBe(value);
    expect([...f.data.values()].every((v) => v.length <= 500)).toBe(true);
  });
  it('partial chunk failure leaves original manifest intact and readable', async () => {
    const f = keychainFixture(), store = f.make();
    await store.write('scope', 'original');
    f.native.setItemAsync.mockRejectedValueOnce(new Error('native write failed'));
    await expect(store.write('scope', 'replacement')).rejects.toThrow();
    expect(await f.make().read('scope')).toBe('original');
  });
  it('replacement publishes new manifest before cleaning old chunks and removal clears it', async () => {
    const f = keychainFixture(), store = f.make();
    await store.write('scope', 'original');
    await store.write('scope', 'replacement');
    expect(await store.read('scope')).toBe('replacement');
    expect([...f.data.keys()].some((key) => key.includes('revision_1'))).toBe(false);
    await store.remove('scope');
    expect(await store.read('scope')).toBeNull();
  });
});
