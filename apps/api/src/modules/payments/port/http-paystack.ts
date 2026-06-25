/**
 * Real Paystack client (TEST mode in this pass — TRD §10/§25, never live keys
 * in dev/CI). Implements PaystackPort over the Paystack REST API. Money is in
 * kobo end-to-end, matching the ledger.
 */
import type { Bank, PaystackPort, TransferParams, TransferResult } from './paystack-port.js';

const BASE = 'https://api.paystack.co';

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
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
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json()) as PaystackEnvelope<T>;
    if (!res.ok || !body.status) {
      throw new PaystackHttpError(res.status, body.message || `Paystack ${path} failed`);
    }
    return body.data;
  }

  async initializeCharge(params: {
    email: string;
    amountKobo: number;
    reference: string;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    const data = await this.call<{ authorization_url: string; reference: string }>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: JSON.stringify({
          email: params.email,
          amount: params.amountKobo, // Paystack expects kobo
          reference: params.reference,
        }),
      },
    );
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  async verifyChargeKobo(
    reference: string,
  ): Promise<{ status: 'success' | 'failed'; amountKobo: number }> {
    const data = await this.call<{ status: string; amount: number }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    return { status: data.status === 'success' ? 'success' : 'failed', amountKobo: data.amount };
  }

  async listBanks(): Promise<Bank[]> {
    const data = await this.call<Array<{ name: string; code: string }>>(
      '/bank?currency=NGN&country=nigeria',
    );
    return data.map((b) => ({ name: b.name, code: b.code }));
  }

  async resolveAccount(params: {
    bankCode: string;
    accountNumber: string;
  }): Promise<{ accountName: string }> {
    const data = await this.call<{ account_name: string }>(
      `/bank/resolve?account_number=${encodeURIComponent(params.accountNumber)}&bank_code=${encodeURIComponent(params.bankCode)}`,
    );
    return { accountName: data.account_name };
  }

  async createTransferRecipient(params: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<{ recipientCode: string }> {
    const data = await this.call<{ recipient_code: string }>('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban',
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: 'NGN',
      }),
    });
    return { recipientCode: data.recipient_code };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    try {
      const data = await this.call<{ status: string; reference: string }>('/transfer', {
        method: 'POST',
        body: JSON.stringify({
          source: 'balance',
          amount: params.amountKobo,
          recipient: params.recipientCode,
          reason: params.reason,
          reference: params.reference,
        }),
      });
      const ok = data.status === 'success' || data.status === 'pending' || data.status === 'otp';
      return { reference: params.reference, status: ok ? 'success' : 'failed' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'transfer failed';
      return { reference: params.reference, status: 'failed', failureReason: reason };
    }
  }

  async verifyTransfer(
    reference: string,
  ): Promise<{ status: 'success' | 'failed' | 'pending' | 'unknown' }> {
    try {
      const data = await this.call<{ status: string }>(
        `/transfer/verify/${encodeURIComponent(reference)}`,
      );
      if (data.status === 'success') return { status: 'success' };
      if (data.status === 'failed' || data.status === 'reversed') return { status: 'failed' };
      return { status: 'pending' }; // otp/pending/processing
    } catch (err) {
      // 404 → Paystack never saw this reference (transfer not issued yet).
      if (err instanceof PaystackHttpError && err.status === 404) return { status: 'unknown' };
      throw err;
    }
  }

  async refund(params: { chargeReference: string; amountKobo: number }): Promise<{ status: 'processed' }> {
    await this.call('/refund', {
      method: 'POST',
      body: JSON.stringify({ transaction: params.chargeReference, amount: params.amountKobo }),
    });
    return { status: 'processed' };
  }

  async getBalanceKobo(): Promise<number> {
    const data = await this.call<Array<{ currency: string; balance: number }>>('/balance');
    const ngn = data.find((b) => b.currency === 'NGN');
    return ngn?.balance ?? 0;
  }
}
