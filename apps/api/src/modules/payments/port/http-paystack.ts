/**
 * Real Paystack client (TEST mode in this pass — TRD §10/§25, never live keys
 * in dev/CI). Implements PaystackPort over the Paystack REST API. Money is in
 * kobo end-to-end, matching the ledger.
 */
import { z } from 'zod';
import type {
  Bank,
  PaystackPort,
  TransferParams,
  TransferResult,
  RefundParams,
  RefundResult,
  CheckoutVerification,
} from './paystack-port.js';

const BASE = 'https://api.paystack.co';

const textValue = z.string().min(1);
const koboValue = z.number().int().safe().nonnegative();
const moneyResponse = z.object({
  status: textValue,
  reference: textValue,
  currency: z.literal('NGN'),
  amount: koboValue,
});
const refundResponse = z.object({
  status: textValue,
  merchant_note: z.string().nullish(),
  amount: koboValue,
  currency: textValue,
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  // Do not expose provider bodies (which can contain account/customer data).
  if (!result.success) throw new Error('Invalid Paystack response');
  return result.data;
}

export class PaystackHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PaystackHttpError';
  }
}

export class HttpPaystack implements PaystackPort {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly options: {
      timeoutMs?: number;
      maxRefundPages?: number;
      maxBankPages?: number;
    } = {},
  ) {
    for (const value of [
      options.timeoutMs ?? 15_000,
      options.maxRefundPages ?? 100,
      options.maxBankPages ?? 100,
    ]) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error('Paystack request limits must be positive integers');
    }
  }

  private async call(path: string, init?: RequestInit): Promise<unknown> {
    return (await this.callEnvelope(path, init)).data;
  }

  private async callEnvelope(path: string, init?: RequestInit) {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const body = parse(
      z.object({ status: z.boolean(), data: z.unknown(), meta: z.unknown() }),
      await res.json(),
    );
    if (!res.ok || !body.status) throw new PaystackHttpError(res.status, 'Paystack request failed');
    return body;
  }

  async initializeCharge(params: {
    email: string;
    amountKobo: number;
    reference: string;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    parse(koboValue.positive(), params.amountKobo);
    const data = parse(
      z.object({ authorization_url: z.string().url(), reference: textValue }),
      await this.call('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          amount: params.amountKobo, // Paystack expects kobo
          currency: 'NGN',
          reference: params.reference,
        }),
      }),
    );
    if (
      data.reference !== params.reference ||
      new URL(data.authorization_url).protocol !== 'https:'
    )
      throw new Error('Paystack checkout reference or URL mismatch');
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  async verifyChargeKobo(
    reference: string,
  ): Promise<{ status: 'success' | 'failed'; amountKobo: number }> {
    const data = parse(
      moneyResponse,
      await this.call(`/transaction/verify/${encodeURIComponent(reference)}`),
    );
    if (data.reference !== reference) throw new Error('Paystack charge reference mismatch');
    return { status: data.status === 'success' ? 'success' : 'failed', amountKobo: data.amount };
  }

  async verifyCheckout(reference: string): Promise<CheckoutVerification> {
    const data = parse(moneyResponse, await this.call(`/transaction/verify/${encodeURIComponent(reference)}`));
    if (data.reference !== reference) throw new Error('Paystack charge reference mismatch');
    const status = z.enum(['success', 'abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'reversed']).safeParse(data.status);
    return { status: status.success ? status.data : 'unknown', amountKobo: data.amount, reference };
  }

  async listBanks(): Promise<Bank[]> {
    const banks: Bank[] = [];
    const cursors = new Set<string>();
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 15_000);
    let next: string | null = null;
    for (let page = 1; page <= (this.options.maxBankPages ?? 100); page += 1) {
      const envelope = await this.callEnvelope(
        `/bank?currency=NGN&country=nigeria&use_cursor=true&perPage=100${next ? `&next=${encodeURIComponent(next)}` : ''}`,
        { signal },
      );
      banks.push(...parse(z.array(z.object({ name: textValue, code: textValue })), envelope.data));
      next = parse(z.object({ next: textValue.nullable() }), envelope.meta).next;
      if (next === null) return banks;
      if (cursors.has(next)) throw new Error('Paystack bank pagination cursor repeated');
      cursors.add(next);
    }
    throw new Error('Paystack bank pagination limit reached');
  }

  async resolveAccount(params: {
    bankCode: string;
    accountNumber: string;
  }): Promise<{ accountName: string }> {
    const data = parse(
      z.object({ account_name: textValue, account_number: textValue }),
      await this.call(
        `/bank/resolve?account_number=${encodeURIComponent(params.accountNumber)}&bank_code=${encodeURIComponent(params.bankCode)}`,
      ),
    );
    if (data.account_number !== params.accountNumber)
      throw new Error('Paystack resolved account mismatch');
    return { accountName: data.account_name };
  }

  async createTransferRecipient(params: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<{ recipientCode: string }> {
    const data = parse(
      z.object({ recipient_code: textValue }),
      await this.call('/transferrecipient', {
        method: 'POST',
        body: JSON.stringify({
          type: 'nuban',
          name: params.accountName,
          account_number: params.accountNumber,
          bank_code: params.bankCode,
          currency: 'NGN',
        }),
      }),
    );
    return { recipientCode: data.recipient_code };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    parse(koboValue.positive(), params.amountKobo);
    try {
      const data = parse(
        moneyResponse,
        await this.call('/transfer', {
          method: 'POST',
          body: JSON.stringify({
            source: 'balance',
            amount: params.amountKobo,
            currency: 'NGN',
            recipient: params.recipientCode,
            reason: params.reason,
            reference: params.reference,
          }),
        }),
      );
      if (data.reference !== params.reference || data.amount !== params.amountKobo)
        throw new Error('Paystack transfer reference or amount mismatch');
      const status =
        data.status === 'success'
          ? 'success'
          : data.status === 'failed' || data.status === 'reversed'
            ? 'failed'
            : ['pending', 'otp', 'processing', 'received'].includes(data.status)
              ? 'pending'
              : 'unknown';
      return { reference: params.reference, status };
    } catch {
      // HTTP errors, malformed responses and transport loss do not prove that
      // the transfer was rejected. Reconcile the original reference instead.
      return { reference: params.reference, status: 'unknown' };
    }
  }

  async verifyTransfer(
    reference: string,
  ): Promise<{ status: 'success' | 'failed' | 'pending' | 'unknown' }> {
    try {
      const data = parse(
        moneyResponse,
        await this.call(`/transfer/verify/${encodeURIComponent(reference)}`),
      );
      if (data.reference !== reference) throw new Error('Paystack transfer reference mismatch');
      if (data.status === 'success') return { status: 'success' };
      if (data.status === 'failed' || data.status === 'reversed') return { status: 'failed' };
      if (['pending', 'otp', 'processing', 'received'].includes(data.status))
        return { status: 'pending' };
      // Callers may dispatch on unknown (not found). An unrecognized existing
      // transfer must instead retain its reservation without another POST.
      throw new Error('Unrecognized Paystack transfer status');
    } catch (err) {
      // A missing reference may be reissued only under the SAME reference.
      if (err instanceof PaystackHttpError && err.status === 404) return { status: 'unknown' };
      throw err;
    }
  }

  async verifyRefund(params: RefundParams): Promise<RefundResult> {
    parse(koboValue.positive(), params.amountKobo);
    const deadline = AbortSignal.timeout(this.options.timeoutMs ?? 15_000);
    // The list endpoint filters by transaction ID, not charge reference.
    const transaction = parse(
      z.object({ id: koboValue.positive(), reference: textValue, currency: z.literal('NGN') }),
      await this.call(`/transaction/verify/${encodeURIComponent(params.chargeReference)}`, {
        signal: deadline,
      }),
    );
    if (transaction.reference !== params.chargeReference)
      throw new Error('Paystack refund transaction reference mismatch');
    let found: RefundResult | undefined;
    for (let page = 1; page <= (this.options.maxRefundPages ?? 100); page += 1) {
      const rows = parse(
        z.array(refundResponse),
        await this.call(`/refund?transaction=${transaction.id}&perPage=100&page=${page}`, {
          signal: deadline,
        }),
      );
      const matches = rows.filter((r) => r.merchant_note === params.reference);
      if (matches.length > 1 || (found && matches.length))
        throw new Error('Multiple refunds match one operation');
      const match = matches[0];
      if (match) {
        if (match.amount !== params.amountKobo || match.currency !== 'NGN')
          throw new Error('Refund amount or currency mismatch');
        found = this.refundStatus(match.status);
      }
      if (rows.length < 100) return found ?? { status: 'unknown' };
    }
    // Incomplete evidence must never look like an absent refund and permit POST.
    throw new Error('Paystack refund pagination limit reached');
  }

  private refundStatus(status: string): RefundResult {
    if (status === 'processed') return { status: 'processed' };
    if (status === 'failed') return { status: 'failed' };
    if (['pending', 'processing', 'needs-attention'].includes(status)) return { status: 'pending' };
    throw new Error('Unrecognized Paystack refund status');
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const existing = await this.verifyRefund(params);
    if (existing.status !== 'unknown') return existing;
    const data = parse(
      refundResponse,
      await this.call('/refund', {
        method: 'POST',
        body: JSON.stringify({
          transaction: params.chargeReference,
          amount: params.amountKobo,
          currency: 'NGN',
          merchant_note: params.reference,
        }),
      }),
    );
    if (
      data.merchant_note !== params.reference ||
      data.amount !== params.amountKobo ||
      data.currency !== 'NGN'
    )
      throw new Error('Paystack refund response mismatch');
    return this.refundStatus(data.status);
  }

  async getBalanceKobo(): Promise<number> {
    const data = parse(
      z.array(z.object({ currency: textValue, balance: koboValue })),
      await this.call('/balance'),
    );
    const ngn = data.filter((b) => b.currency === 'NGN');
    if (ngn.length !== 1) throw new Error('Missing or duplicate Paystack NGN balance');
    return ngn[0]!.balance;
  }
}
