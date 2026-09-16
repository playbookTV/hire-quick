import { describe, it, expect, vi } from 'vitest';
import { HttpPaystack } from '../http-paystack.js';

const ok = (data: unknown) => new Response(JSON.stringify({ status: true, data }));
const params = { chargeReference: 'chg_1', amountKobo: 5000, reference: 'BOOKING_REFUND:bk1' };
const refund = {
  merchant_note: params.reference,
  amount: 5000,
  currency: 'NGN',
  status: 'processed',
};

describe('Paystack refund boundary', () => {
  it('resolves the transaction ID and preserves a queued refund as pending', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: params.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok({ ...refund, status: 'pending' }));
    expect(await new HttpPaystack('test', fetcher).refund(params)).toEqual({ status: 'pending' });
    expect(fetcher.mock.calls[1]?.[0]).toContain('/refund?transaction=123&perPage=100&page=1');
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toMatchObject({
      merchant_note: params.reference,
      amount: 5000,
    });
  });
  it('finds a processed refund on a later page without a second POST', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: params.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(
        ok(Array.from({ length: 100 }, () => ({ ...refund, merchant_note: 'other' }))),
      )
      .mockResolvedValueOnce(ok([refund]));
    expect(await new HttpPaystack('test', fetcher).refund(params)).toEqual({ status: 'processed' });
    expect(fetcher.mock.calls[2]?.[0]).toContain('page=2');
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true,
    );
  });
  it('never creates a refund during read-only recovery', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: params.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(ok([]));
    expect(await new HttpPaystack('test', fetcher).verifyRefund(params)).toEqual({
      status: 'unknown',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects a matching note with a mismatched amount', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: params.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(ok([{ ...refund, amount: 1 }]));
    await expect(new HttpPaystack('test', fetcher).refund(params)).rejects.toThrow(/mismatch/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects duplicate refund evidence split across pages', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: params.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(
        ok([refund, ...Array.from({ length: 99 }, () => ({ ...refund, merchant_note: 'other' }))]),
      )
      .mockResolvedValueOnce(ok([refund]));
    await expect(new HttpPaystack('test', fetcher).verifyRefund(params)).rejects.toThrow(
      /Multiple refunds/,
    );
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true,
    );
  });
});

describe('Paystack transfer uncertainty', () => {
  const transfer = { reference: 'wd_1', amountKobo: 5000, recipientCode: 'rcp_1', reason: 'test' };
  it.each(['pending', 'otp', 'processing'])('does not call %s completed', async (status) => {
    expect(
      (
        await new HttpPaystack(
          'test',
          vi.fn<typeof fetch>().mockResolvedValue(
            ok({
              status,
              reference: transfer.reference,
              amount: transfer.amountKobo,
              currency: 'NGN',
            }),
          ),
        ).transfer(transfer)
      ).status,
    ).toBe('pending');
  });
  it.each(['network', 'http', 'json'])('keeps %s errors uncertain', async (kind) => {
    const fetcher = vi.fn<typeof fetch>();
    if (kind === 'network') fetcher.mockRejectedValue(new Error('response lost'));
    else if (kind === 'http')
      fetcher.mockResolvedValue(new Response(JSON.stringify({ status: false }), { status: 500 }));
    else fetcher.mockResolvedValue(new Response('not-json'));
    expect((await new HttpPaystack('test', fetcher).transfer(transfer)).status).toBe('unknown');
  });
  it.each(['success', 'failed'])('preserves explicit %s', async (status) => {
    expect(
      (
        await new HttpPaystack(
          'test',
          vi.fn<typeof fetch>().mockResolvedValue(
            ok({
              status,
              reference: transfer.reference,
              amount: transfer.amountKobo,
              currency: 'NGN',
            }),
          ),
        ).transfer(transfer)
      ).status,
    ).toBe(status);
  });
});
