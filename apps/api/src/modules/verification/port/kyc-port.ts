/**
 * Boundary to the KYC provider (Dojah). Mirrors PaystackPort/StoragePort: the app
 * depends on this interface, NoopKyc lets the app boot + tests run with no live
 * keys, and DojahKyc is the HTTP implementation. Swapping Dojah for Smile ID later
 * means a new implementation behind this same interface — no call-site changes.
 *
 * Trust model: the device widget's onClose/onSuccess callbacks are NOT trusted
 * (abandonment fires onClose). The `kyc.widget` webhook + server-side reconcile by
 * referenceId are authoritative.
 */

/** Verdict the API maps onto Usher.verificationStatus. */
export type KycDecision = 'verified' | 'pending' | 'rejected';

export interface KycStartResult {
  /** Provider widget id the device SDK launches. */
  widgetId: string;
  /** Caller-supplied reference id; the webhook + getResult reconcile on this. */
  referenceId: string;
}

export interface KycResult {
  decision: KycDecision;
  /** Standardised rejection code (maps to VerificationRejectReason) when decision is 'rejected'. */
  reasonCode?: string | undefined;
  nin?: string | undefined;
  bvn?: string | undefined;
  livenessPassed?: boolean | undefined;
  faceMatchScore?: number | undefined;
  watchListed?: boolean | undefined;
  /** Government photo as base64, when the provider returns one. */
  govPhotoBase64?: string | undefined;
  /** Raw provider payload, persisted (PII-scoped) for audit/review. */
  raw?: unknown;
}

export interface KycPort {
  /** Session params for the device widget. We persist `referenceId` before returning. */
  startSession(referenceId: string): Promise<KycStartResult>;
  /** Authoritative result for a reference id (server-side source of truth). */
  getResult(referenceId: string): Promise<KycResult>;
  /**
   * Validate + parse a provider webhook. Returns the reconciled referenceId +
   * result, or null when the payload is unauthentic/unparseable.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): { referenceId: string; result: KycResult } | null;
}
