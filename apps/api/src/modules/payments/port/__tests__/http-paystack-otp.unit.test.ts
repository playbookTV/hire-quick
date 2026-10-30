/** Transfer OTP finalize/resend contracts for phase 1 payout runs (OTP kept on). */
import { describe, expect, it, vi } from 'vitest';
import { HttpPaystack } from '../http-paystack.js';
import { TransferOtpNotRequired, TransferOtpRejected } from '../paystack-port.js';

const reference = 'wd_12345678-1234-1234-1234-123456789abc';
const pending = (status: string) => ({
  status,
  reference,
  amount: 150_000,
  currency: 'NGN',
  transfer_code: 'TRF_test',
});
const ok = (data: unknown) => new Response(JSON.stringify({ status: true, data }));
const refused = () =>
  new Response(JSON.stringify({ status: false, message: 'Invalid OTP', data: null }), { status: 400 });

function client(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  return { api: new HttpPaystack('sk_test_fixture', fetcher), fetcher };
}

describe('transfer OTP', () => {
  it('finalizes an OTP-gated transfer with its transfer code', async () => {
    const { api, fetcher } = client(ok(pending('otp')), ok({ ...pending('pending') }));
    await expect(api.finalizeTransfer({ reference, otp: '123456' })).resolves.toEqual({
      status: 'pending',
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`https://api.paystack.co/transfer/verify/${reference}`);
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.paystack.co/transfer/finalize_transfer');
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      transfer_code: 'TRF_test',
      otp: '123456',
    });
  });

  it('reports a refused code without echoing it', async () => {
    const { api } = client(ok(pending('otp')), refused());
    const error = await api.finalizeTransfer({ reference, otp: '999999' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransferOtpRejected);
    expect(String((error as Error).message)).not.toContain('999999');
  });

  it('does not finalize a transfer that is not waiting for a code', async () => {
    const { api, fetcher } = client(ok(pending('success')));
    const error = await api.finalizeTransfer({ reference, otp: '123456' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransferOtpNotRequired);
    expect((error as TransferOtpNotRequired).status).toBe('success');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('resends a code only while the transfer waits for one', async () => {
    const { api, fetcher } = client(ok(pending('otp')), ok({}));
    await api.resendTransferOtp(reference);
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.paystack.co/transfer/resend_otp');
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      transfer_code: 'TRF_test',
      reason: 'resend_otp',
    });
    const done = client(ok(pending('processing')));
    await expect(done.api.resendTransferOtp(reference)).rejects.toBeInstanceOf(TransferOtpNotRequired);
  });
});
