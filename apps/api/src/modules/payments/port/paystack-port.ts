/**
 * Boundary to Paystack. Phase 1 uses InMemoryPaystack so the ledger can be
 * tested with no network/live keys (TRD §25). Phase 2 adds HttpPaystack against
 * TEST keys behind the same interface.
 */
export interface TransferParams {
  amountKobo: number;
  recipientCode: string;
  reason: string;
  reference: string;
}

export interface TransferResult {
  reference: string;
  status: 'success' | 'failed';
  failureReason?: string;
}

export interface Bank {
  name: string;
  code: string;
}

export interface PaystackPort {
  /** Start a checkout; returns a hosted authorization URL + the charge reference. */
  initializeCharge(params: {
    email: string;
    amountKobo: number;
    reference: string;
  }): Promise<{ authorizationUrl: string; reference: string }>;
  /** Verify a charge reference (webhook-confirmed in real life). */
  verifyChargeKobo(reference: string): Promise<{ status: 'success' | 'failed'; amountKobo: number }>;
  /** Nigerian banks for the withdraw picker (Paystack `GET /bank`). */
  listBanks(): Promise<Bank[]>;
  /**
   * Resolve a NUBAN account number to its registered account name (Paystack
   * `GET /bank/resolve`). Throws if the account can't be resolved.
   */
  resolveAccount(params: { bankCode: string; accountNumber: string }): Promise<{ accountName: string }>;
  createTransferRecipient(params: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<{ recipientCode: string }>;
  transfer(params: TransferParams): Promise<TransferResult>;
  refund(params: { chargeReference: string; amountKobo: number }): Promise<{ status: 'processed' }>;
  /** Current Paystack Balance (kobo) — reconciled daily against the ledger (§17). */
  getBalanceKobo(): Promise<number>;
}

/** In-memory fake for ledger tests. Tracks a balance so reconciliation can be exercised. */
export class InMemoryPaystack implements PaystackPort {
  private balanceKobo = 0;
  private nextTransferFails = false;
  private seq = 0;

  /** Simulate funds landing in the Balance when a client charge settles. */
  creditBalance(amountKobo: number): void {
    this.balanceKobo += amountKobo;
  }

  /** Force the next transfer() to report failure (e.g. invalid bank details). */
  failNextTransfer(): void {
    this.nextTransferFails = true;
  }

  /** Test hook: nudge the balance to seed reconciliation drift. */
  setBalanceKobo(v: number): void {
    this.balanceKobo = v;
  }

  initializeCharge(params: {
    email: string;
    amountKobo: number;
    reference: string;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    return Promise.resolve({
      authorizationUrl: `https://checkout.test/${params.reference}`,
      reference: params.reference,
    });
  }

  verifyChargeKobo(_reference: string): Promise<{ status: 'success' | 'failed'; amountKobo: number }> {
    return Promise.resolve({ status: 'success', amountKobo: 0 });
  }

  listBanks(): Promise<Bank[]> {
    return Promise.resolve([
      { name: 'Access Bank', code: '044' },
      { name: 'Guaranty Trust Bank', code: '058' },
      { name: 'Zenith Bank', code: '057' },
      { name: 'United Bank for Africa', code: '033' },
      { name: 'Kuda Bank', code: '50211' },
      { name: 'Opay', code: '999992' },
    ]);
  }

  resolveAccount(params: {
    bankCode: string;
    accountNumber: string;
  }): Promise<{ accountName: string }> {
    // Deterministic fake so ledger/withdraw tests stay network-free.
    return Promise.resolve({ accountName: `TEST ACCOUNT ${params.accountNumber.slice(-4)}` });
  }

  createTransferRecipient(): Promise<{ recipientCode: string }> {
    return Promise.resolve({ recipientCode: `rcp_${++this.seq}` });
  }

  transfer(params: TransferParams): Promise<TransferResult> {
    if (this.nextTransferFails) {
      this.nextTransferFails = false;
      return Promise.resolve({
        reference: params.reference,
        status: 'failed',
        failureReason: 'invalid bank details',
      });
    }
    this.balanceKobo -= params.amountKobo;
    return Promise.resolve({ reference: params.reference, status: 'success' });
  }

  refund(params: { chargeReference: string; amountKobo: number }): Promise<{ status: 'processed' }> {
    this.balanceKobo -= params.amountKobo;
    return Promise.resolve({ status: 'processed' });
  }

  getBalanceKobo(): Promise<number> {
    return Promise.resolve(this.balanceKobo);
  }
}
