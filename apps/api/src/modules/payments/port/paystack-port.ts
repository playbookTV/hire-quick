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
  /**
   * Authoritative status of a previously-issued transfer by reference (Paystack
   * `GET /transfer/verify/:reference`). Used by the recovery job to resume a
   * withdrawal stuck in PROCESSING when its webhook never arrived.
   */
  verifyTransfer(reference: string): Promise<{ status: 'success' | 'failed' | 'pending' | 'unknown' }>;
  /**
   * Refund a settled charge (full or partial) back to the client.
   *
   * `reference` is a caller-supplied, deterministic idempotency key (the durable
   * BOOKING_REFUND dedupeKey). Implementations MUST be at-most-once with respect
   * to it: a retry carrying the same reference must NOT issue a second refund.
   * This is what makes a crash between the provider call and the PROVIDER_OK
   * commit (payments/ledger/operations.ts) safe to replay.
   *
   * Paystack's `POST /refund` has no native idempotency field, so the Phase-2
   * HTTP adapter MUST embed `reference` in `merchant_note` and, before creating a
   * refund, call `GET /refund?transaction=<chargeReference>` and short-circuit
   * (return { status: 'processed' }) when a refund whose merchant_note ===
   * reference already exists. Per-booking dedup matters because one order/charge
   * can legitimately be refunded once per booking, so a transaction-only check is
   * insufficient — the reference is what distinguishes the bookings.
   */
  refund(params: { chargeReference: string; amountKobo: number; reference: string }): Promise<{ status: 'processed' }>;
  /** Current Paystack Balance (kobo) — reconciled daily against the ledger (§17). */
  getBalanceKobo(): Promise<number>;
}

/** In-memory fake for ledger tests. Tracks a balance so reconciliation can be exercised. */
export class InMemoryPaystack implements PaystackPort {
  private balanceKobo = 0;
  private nextTransferFails = false;
  private seq = 0;
  // Charged amount per reference, so verifyChargeKobo can mirror a real
  // server-side transaction verification (set at initializeCharge, or seeded
  // directly in tests that don't go through the charge-init flow).
  private readonly charges = new Map<string, number>();
  // Issued transfers by reference, so verifyTransfer can mirror a real
  // GET /transfer/verify/:reference for the recovery job.
  private readonly transfers = new Map<string, 'success' | 'failed' | 'pending'>();
  // Processed refunds keyed by idempotency reference, so a replayed reference is a
  // no-op (mirrors the HTTP adapter's merchant_note dedup) and never double-debits
  // the Balance — the contract the durable BOOKING_REFUND op relies on.
  private readonly refunds = new Map<string, number>();

  /** Simulate funds landing in the Balance when a client charge settles. */
  creditBalance(amountKobo: number): void {
    this.balanceKobo += amountKobo;
  }

  /** Test hook: record the kobo amount a reference was charged for. */
  recordCharge(reference: string, amountKobo: number): void {
    this.charges.set(reference, amountKobo);
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
    this.charges.set(params.reference, params.amountKobo);
    return Promise.resolve({
      authorizationUrl: `https://checkout.test/${params.reference}`,
      reference: params.reference,
    });
  }

  verifyChargeKobo(reference: string): Promise<{ status: 'success' | 'failed'; amountKobo: number }> {
    return Promise.resolve({ status: 'success', amountKobo: this.charges.get(reference) ?? 0 });
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
    // Re-issuing the same reference is idempotent (mirrors Paystack rejecting a
    // duplicate reference): return the recorded outcome without double-debiting.
    const prior = this.transfers.get(params.reference);
    if (prior) return Promise.resolve({ reference: params.reference, status: prior === 'failed' ? 'failed' : 'success' });
    if (this.nextTransferFails) {
      this.nextTransferFails = false;
      this.transfers.set(params.reference, 'failed');
      return Promise.resolve({
        reference: params.reference,
        status: 'failed',
        failureReason: 'invalid bank details',
      });
    }
    this.balanceKobo -= params.amountKobo;
    this.transfers.set(params.reference, 'success');
    return Promise.resolve({ reference: params.reference, status: 'success' });
  }

  verifyTransfer(reference: string): Promise<{ status: 'success' | 'failed' | 'pending' | 'unknown' }> {
    return Promise.resolve({ status: this.transfers.get(reference) ?? 'unknown' });
  }

  refund(params: { chargeReference: string; amountKobo: number; reference: string }): Promise<{ status: 'processed' }> {
    // At-most-once by reference: a replayed reference must not debit the Balance
    // twice (mirrors the HTTP adapter's merchant_note dedup, TRD §10).
    if (this.refunds.has(params.reference)) {
      return Promise.resolve({ status: 'processed' });
    }
    this.refunds.set(params.reference, params.amountKobo);
    this.balanceKobo -= params.amountKobo;
    return Promise.resolve({ status: 'processed' });
  }

  getBalanceKobo(): Promise<number> {
    return Promise.resolve(this.balanceKobo);
  }
}
