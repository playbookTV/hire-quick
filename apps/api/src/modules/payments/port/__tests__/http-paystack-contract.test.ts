/** Local HTTP-boundary contract checks; these do not certify a Paystack account. */
import { describe, expect, it, vi } from 'vitest';
import { HttpPaystack } from '../http-paystack.js';

const ok = (data: unknown) => new Response(JSON.stringify({ status: true, data }));
const transfer = {
  reference: 'wd_12345678-1234-1234-1234-123456789abc',
  amountKobo: 5000,
  recipientCode: 'RCP_test',
  reason: 'HireQuick payout',
};
const transferData = {
  status: 'success',
  reference: transfer.reference,
  amount: 5000,
  currency: 'NGN',
};
const refund = { chargeReference: 'order-123', amountKobo: 5000, reference: 'BOOKING_REFUND:bk1' };
const refundData = {
  merchant_note: refund.reference,
  amount: refund.amountKobo,
  currency: 'NGN',
  status: 'processed',
};

function client(data: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(data));
  return { api: new HttpPaystack('sk_test_fixture', fetcher), fetcher };
}

function body(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) {
  return JSON.parse(String(fetcher.mock.calls[call]?.[1]?.body));
}

describe('Paystack request contracts', () => {
  it('initializes hosted checkout using integer kobo, NGN and the original reference', async () => {
    const { api, fetcher } = client({
      authorization_url: 'https://checkout.paystack.com/test',
      reference: 'order-123',
    });
    expect(
      await api.initializeCharge({
        email: 'test@example.com',
        amountKobo: 5000,
        reference: 'order-123',
      }),
    ).toEqual({ authorizationUrl: 'https://checkout.paystack.com/test', reference: 'order-123' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.paystack.co/transaction/initialize');
    expect(body(fetcher)).toEqual({
      email: 'test@example.com',
      amount: 5000,
      currency: 'NGN',
      reference: 'order-123',
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer sk_test_fixture' },
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('verifies the encoded charge reference against NGN evidence', async () => {
    const { api, fetcher } = client({ ...transferData, reference: 'order=a/b' });
    expect(await api.verifyChargeKobo('order=a/b')).toEqual({
      status: 'success',
      amountKobo: 5000,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.paystack.co/transaction/verify/order%3Da%2Fb',
    );
  });

  it.each(['pending', 'failed', 'abandoned', 'processing'])(
    'never accepts a %s charge',
    async (status) => {
      const { api } = client({ ...transferData, status });
      expect((await api.verifyChargeKobo(transfer.reference)).status).toBe('failed');
    },
  );

  it('loads Nigerian banks preserving leading zero codes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: true,
            data: [{ name: 'Bank', code: '044' }],
            meta: { next: null },
          }),
        ),
      );
    const api = new HttpPaystack('test', fetcher);
    expect(await api.listBanks()).toEqual([{ name: 'Bank', code: '044' }]);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.paystack.co/bank?currency=NGN&country=nigeria&use_cursor=true&perPage=100',
    );
  });

  it('resolves and binds the account name to the requested account number', async () => {
    const { api, fetcher } = client({ account_number: '0123456789', account_name: 'TEST ACCOUNT' });
    expect(
      await api.resolveAccount({ bankCode: '044&other=x', accountNumber: '0123456789' }),
    ).toEqual({ accountName: 'TEST ACCOUNT' });
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      'account_number=0123456789&bank_code=044%26other%3Dx',
    );
  });

  it('creates a Nigerian NUBAN recipient', async () => {
    const { api, fetcher } = client({ recipient_code: 'RCP_test' });
    expect(
      await api.createTransferRecipient({
        bankCode: '044',
        accountNumber: '0123456789',
        accountName: 'TEST ACCOUNT',
      }),
    ).toEqual({ recipientCode: 'RCP_test' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.paystack.co/transferrecipient');
    expect(body(fetcher)).toEqual({
      type: 'nuban',
      currency: 'NGN',
      name: 'TEST ACCOUNT',
      bank_code: '044',
      account_number: '0123456789',
    });
  });

  it('transfers exactly the requested kobo under the original reference', async () => {
    const { api, fetcher } = client(transferData);
    expect(await api.transfer(transfer)).toEqual({
      reference: transfer.reference,
      status: 'success',
    });
    expect(body(fetcher)).toEqual({
      source: 'balance',
      currency: 'NGN',
      amount: 5000,
      reference: transfer.reference,
      recipient: 'RCP_test',
      reason: 'HireQuick payout',
    });
  });

  it.each([
    ['success', 'success'],
    ['failed', 'failed'],
    ['reversed', 'failed'],
    ['pending', 'pending'],
    ['otp', 'pending'],
    ['processing', 'pending'],
    ['received', 'pending'],
  ])('verifies transfer %s as %s', async (status, expected) => {
    const { api, fetcher } = client({ ...transferData, status });
    expect(await api.verifyTransfer(transfer.reference)).toEqual({ status: expected });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.paystack.co/transfer/verify/${transfer.reference}`,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('selects the NGN balance with other currency accounts present', async () => {
    const { api } = client([
      { currency: 'GHS', balance: 8000 },
      { currency: 'NGN', balance: 5000 },
    ]);
    expect(await api.getBalanceKobo()).toBe(5000);
  });
});

describe('Untrusted provider evidence', () => {
  it.each([
    { currency: 'USD' },
    { reference: 'someone-else' },
    { amount: 1.5 },
    { amount: '5000' },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { amount: -1 },
  ])('rejects unsafe charge evidence %j', async (patch) => {
    const { api } = client({ ...transferData, ...patch });
    await expect(api.verifyChargeKobo(transfer.reference)).rejects.toThrow();
  });

  it.each([{ reference: 'other' }, { authorization_url: 'http://checkout.paystack.com/test' }])(
    'rejects checkout mismatch %j',
    async (patch) => {
      const { api } = client({
        reference: 'order-123',
        authorization_url: 'https://checkout.paystack.com/test',
        ...patch,
      });
      await expect(
        api.initializeCharge({
          email: 'test@example.com',
          reference: 'order-123',
          amountKobo: 5000,
        }),
      ).rejects.toThrow();
    },
  );

  it('does not resolve a different account', async () => {
    const { api } = client({ account_number: '9999999999', account_name: 'OTHER ACCOUNT' });
    await expect(
      api.resolveAccount({ bankCode: '044', accountNumber: '0123456789' }),
    ).rejects.toThrow(/mismatch/);
  });

  it.each([null, {}, { status: 'true', data: transferData }, { status: true, data: null }])(
    'rejects malformed envelopes %j',
    async (envelope) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(envelope)));
      await expect(
        new HttpPaystack('test', fetcher).verifyTransfer(transfer.reference),
      ).rejects.toThrow();
    },
  );

  it.each([
    { currency: 'USD' },
    { reference: 'other' },
    { amount: 1 },
    { status: 'new-provider-status' },
  ])('keeps transfer POST mismatch uncertain %j', async (patch) => {
    const { api } = client({ ...transferData, ...patch });
    expect(await api.transfer(transfer)).toEqual({
      reference: transfer.reference,
      status: 'unknown',
    });
  });

  it('throws on an undocumented existing transfer status so recovery cannot interpret it as absent', async () => {
    const { api } = client({ ...transferData, status: 'new-provider-status' });
    await expect(api.verifyTransfer(transfer.reference)).rejects.toThrow(/Unrecognized/);
  });

  it.each([400, 401, 429, 500])('does not treat HTTP %s as a missing transfer', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: 'provider detail' }), { status }),
      );
    await expect(
      new HttpPaystack('test', fetcher).verifyTransfer(transfer.reference),
    ).rejects.toThrow('Paystack request failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a provider 404 from malformed proxy error evidence', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: false }), { status: 404 }))
      .mockResolvedValueOnce(new Response('<html>not found</html>', { status: 404 }));
    const api = new HttpPaystack('test', fetcher);
    expect(await api.verifyTransfer(transfer.reference)).toEqual({ status: 'unknown' });
    await expect(api.verifyTransfer(transfer.reference)).rejects.toThrow();
  });

  it.each([
    { data: [] },
    { data: [{ currency: 'USD', balance: 5000 }] },
    { data: [
      { currency: 'NGN', balance: 0 },
      { currency: 'NGN', balance: 1 },
    ] },
    { data: [{ currency: 'NGN', balance: 1.1 }] },
  ])('rejects incomplete/ambiguous balance evidence %j', async ({ data }) => {
    await expect(client(data).api.getBalanceKobo()).rejects.toThrow();
  });

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'refuses unsafe outgoing amount %s before dispatch',
    async (amountKobo) => {
      const { api, fetcher } = client(transferData);
      await expect(api.transfer({ ...transfer, amountKobo })).rejects.toThrow();
      await expect(
        api.initializeCharge({ email: 'test@example.com', reference: 'order-123', amountKobo }),
      ).rejects.toThrow();
      await expect(api.refund({ ...refund, amountKobo })).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});

describe('Refund lifecycle and bounded requests', () => {
  it.each([
    ['processed', 'processed'],
    ['failed', 'failed'],
    ['pending', 'pending'],
    ['processing', 'pending'],
    ['needs-attention', 'pending'],
  ])('preserves an existing %s refund as %s without dispatch', async (status, expected) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: refund.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(ok([{ ...refundData, status }]));
    expect(await new HttpPaystack('test', fetcher).refund(refund)).toEqual({ status: expected });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never reissues a refund when an existing status is undocumented', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: refund.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(ok([{ ...refundData, status: 'new-status' }]));
    await expect(new HttpPaystack('test', fetcher).refund(refund)).rejects.toThrow(/Unrecognized/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses to dispatch after an incomplete refund scan reaches its page limit', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: refund.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(
        ok(Array.from({ length: 100 }, () => ({ ...refundData, merchant_note: 'other' }))),
      );
    await expect(
      new HttpPaystack('test', fetcher, { maxRefundPages: 1 }).refund(refund),
    ).rejects.toThrow(/pagination limit/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses one deadline across refund pages', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 123, reference: refund.chargeReference, currency: 'NGN' }))
      .mockResolvedValueOnce(
        ok(Array.from({ length: 100 }, () => ({ ...refundData, merchant_note: 'other' }))),
      )
      .mockResolvedValueOnce(ok([]));
    await new HttpPaystack('test', fetcher).verifyRefund(refund);
    expect(fetcher.mock.calls[1]?.[1]?.signal).toBe(fetcher.mock.calls[2]?.[1]?.signal);
  });

  it('aborts a stalled transfer and keeps its outcome unknown without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
            once: true,
          });
        }),
    );
    expect(await new HttpPaystack('test', fetcher, { timeoutMs: 10 }).transfer(transfer)).toEqual({
      reference: transfer.reference,
      status: 'unknown',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('propagates read timeouts without inventing a zero balance', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
            once: true,
          });
        }),
    );
    await expect(
      new HttpPaystack('test', fetcher, { timeoutMs: 10 }).getBalanceKobo(),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Paginated bank directory', () => {
  const page = (name: string, next: string | null) =>
    new Response(
      JSON.stringify({
        status: true,
        data: [{ name, code: '044' }],
        meta: { next },
      }),
    );

  it('follows encoded cursors until the directory ends using a shared deadline', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page('First bank', 'abc+/='))
      .mockResolvedValueOnce(page('Last bank', null));
    expect(await new HttpPaystack('test', fetcher).listBanks()).toEqual([
      { name: 'First bank', code: '044' },
      { name: 'Last bank', code: '044' },
    ]);
    expect(fetcher.mock.calls[1]?.[0]).toContain('&next=abc%2B%2F%3D');
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(fetcher.mock.calls[1]?.[1]?.signal);
  });

  it('rejects repeating cursors rather than looping indefinitely', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page('First bank', 'repeat'))
      .mockResolvedValueOnce(page('First bank', 'repeat'));
    await expect(new HttpPaystack('test', fetcher).listBanks()).rejects.toThrow(/cursor repeated/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not return an incomplete bank directory at the page limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(page('First bank', 'next'));
    await expect(
      new HttpPaystack('test', fetcher, { maxBankPages: 1 }).listBanks(),
    ).rejects.toThrow(/pagination limit/);
  });

  it('does not assume missing pagination metadata means completion', async () => {
    await expect(client([{ name: 'First bank', code: '044' }]).api.listBanks()).rejects.toThrow();
  });
});

describe('Refund evidence binding', () => {
  it.each([{ amount: 1 }, { currency: 'USD' }, { merchant_note: 'someone-else' }])(
    'does not finalize a mismatched refund POST %j',
    async (patch) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(ok({ id: 123, reference: refund.chargeReference, currency: 'NGN' }))
        .mockResolvedValueOnce(ok([]))
        .mockResolvedValueOnce(ok({ ...refundData, ...patch }));
      await expect(new HttpPaystack('test', fetcher).refund(refund)).rejects.toThrow(/mismatch/);
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );

  it.each([{ reference: 'someone-else' }, { currency: 'USD' }])(
    'does not scan or create refunds against a mismatched charge %j',
    async (patch) => {
      const { api, fetcher } = client({
        id: 123,
        reference: refund.chargeReference,
        currency: 'NGN',
        ...patch,
      });
      await expect(api.refund(refund)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});
