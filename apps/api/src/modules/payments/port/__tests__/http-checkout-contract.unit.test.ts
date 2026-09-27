import { describe, expect, it, vi } from 'vitest';
import { HttpPaystack } from '../http-paystack.js';

const data = { reference: 'hq-original', amount: 10000, currency: 'NGN' };
function port(value: unknown, status = 200) {
  return new HttpPaystack('test-only', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: status === 200, data: value }), { status })));
}
describe('documented checkout verification states', () => {
  it.each(['success', 'abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'reversed'])('preserves %s without collapsing it into a failure', async (status) => {
    expect(await port({ ...data, status }).verifyCheckout(data.reference)).toEqual({ reference: data.reference, amountKobo: data.amount, status });
  });
  it('returns unknown for an unfamiliar provider status', async () => {
    expect((await port({ ...data, status: 'new-state' }).verifyCheckout(data.reference)).status).toBe('unknown');
  });
  it.each([{ reference: 'other' }, { currency: 'USD' }, { amount: 1.5 }, { amount: -1 }])('rejects mismatched or malformed money evidence %j', async (patch) => {
    await expect(port({ ...data, status: 'abandoned', ...patch }).verifyCheckout(data.reference)).rejects.toThrow();
  });
  it('does not treat reference-not-found as conclusive unpaid evidence', async () => {
    await expect(port(null, 404).verifyCheckout(data.reference)).rejects.toThrow();
  });
});
