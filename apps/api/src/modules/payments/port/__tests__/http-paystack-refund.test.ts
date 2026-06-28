import { describe, it, expect } from 'vitest';
import { HttpPaystack } from '../http-paystack.js';

/** Build a Paystack-shaped JSON envelope response. */
function ok(data: unknown): Response {
  return new Response(JSON.stringify({ status: true, message: 'ok', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('HttpPaystack.refund — idempotency (P0)', () => {
  it('lists existing refunds, then creates one carrying the reference as merchant_note', async () => {
    const calls: Recorded[] = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      // No prior refunds for this charge.
      if (method === 'GET') return Promise.resolve(ok([]));
      return Promise.resolve(ok({ id: 1, status: 'processed' }));
    }) as unknown as typeof fetch;

    const ps = new HttpPaystack('sk_test_x', fetchImpl);
    const out = await ps.refund({ chargeReference: 'chg_1', amountKobo: 5000, reference: 'BOOKING_REFUND:bk1' });

    expect(out).toEqual({ status: 'processed' });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toContain('/refund?transaction=chg_1');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toContain('/refund');
    expect(calls[1]?.body).toMatchObject({ transaction: 'chg_1', amount: 5000, merchant_note: 'BOOKING_REFUND:bk1' });
  });

  it('short-circuits a replay: when a refund with the same reference exists, it issues NO second POST', async () => {
    const methods: string[] = [];
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      // A refund carrying our reference is already on record (first attempt
      // succeeded at Paystack before the crash).
      if (method === 'GET') return Promise.resolve(ok([{ merchant_note: 'BOOKING_REFUND:bk1' }]));
      return Promise.resolve(ok({}));
    }) as unknown as typeof fetch;

    const ps = new HttpPaystack('sk_test_x', fetchImpl);
    const out = await ps.refund({ chargeReference: 'chg_1', amountKobo: 5000, reference: 'BOOKING_REFUND:bk1' });

    expect(out).toEqual({ status: 'processed' });
    expect(methods).toEqual(['GET']); // GET only — no POST, so no double refund
  });
});
