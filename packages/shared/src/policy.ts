/**
 * Cancellation / no-show / dispute POLICY MATRIX — the single source of truth
 * (PRD §13, TRD §21). Mobile, admin, and the ledger engine all import this so
 * they compute identical outcomes. Percentages are launch defaults (PRD §13).
 */

export type CancelWindow = 'GT_48H' | 'BETWEEN_12_48H' | 'LT_12H';
export type CancelActor = 'CLIENT' | 'USHER';

/**
 * Whether the non-refundable Paystack processing fee is deducted from a client
 * refund (TRD §23 Q4). DEFAULT OFF and intentionally not yet wired into the
 * ledger: turning this on also requires a retained-fee ledger entry and a
 * reconciliation-formula change. Pair with `refundWithFeeDeduction` in money.ts.
 */
export const DEDUCT_PROCESSING_FEE_ON_REFUND = false;
/** Paystack processing fee in basis points, applied only when the flag above is on. */
export const REFUND_PROCESSING_FEE_BPS = 150; // 1.5% — placeholder until §23 Q4 settles

export type ReputationEffect = 'NONE' | 'MINOR_FLAG' | 'PENALTY' | 'MAJOR_PENALTY';

export interface PolicyOutcome {
  /** % of the booking amount refunded to the client (0–100). */
  clientRefundPct: number;
  /** % of the booking amount released to the usher (0–100). */
  usherPayoutPct: number;
  /** Reputation effect applied to the usher. */
  usherReputation: ReputationEffect;
  /** Repeat offenders may be suspended (PRD §13, usher cancel < 12h). */
  suspendIfRepeat: boolean;
  /**
   * Whether the non-refundable Paystack processing fee is deducted from the
   * refund. PENDING TRD §23 Q4 — do not ship hard until settled (PRD §13 †).
   */
  lessProcessingFee: boolean;
}

/** Classify how far before the event start a cancellation occurred. */
export function cancelWindow(eventStart: Date, now: Date): CancelWindow {
  const hoursUntil = (eventStart.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil > 48) return 'GT_48H';
  if (hoursUntil >= 12) return 'BETWEEN_12_48H';
  return 'LT_12H';
}

// PRD §13 — Client cancels a confirmed booking.
const CLIENT_CANCEL: Record<CancelWindow, PolicyOutcome> = {
  GT_48H: {
    clientRefundPct: 100,
    usherPayoutPct: 0,
    usherReputation: 'NONE',
    suspendIfRepeat: false,
    lessProcessingFee: DEDUCT_PROCESSING_FEE_ON_REFUND, // Provider decision gate remains off.
  },
  BETWEEN_12_48H: {
    clientRefundPct: 50,
    usherPayoutPct: 50,
    usherReputation: 'NONE',
    suspendIfRepeat: false,
    lessProcessingFee: false,
  },
  LT_12H: {
    clientRefundPct: 0,
    usherPayoutPct: 100,
    usherReputation: 'NONE',
    suspendIfRepeat: false,
    lessProcessingFee: false,
  },
};

// PRD §13 — Usher cancels a confirmed booking (client always fully refunded).
const USHER_CANCEL: Record<CancelWindow, PolicyOutcome> = {
  GT_48H: {
    clientRefundPct: 100,
    usherPayoutPct: 0,
    usherReputation: 'MINOR_FLAG',
    suspendIfRepeat: false,
    lessProcessingFee: false,
  },
  BETWEEN_12_48H: {
    clientRefundPct: 100,
    usherPayoutPct: 0,
    usherReputation: 'PENALTY',
    suspendIfRepeat: false,
    lessProcessingFee: false,
  },
  LT_12H: {
    clientRefundPct: 100,
    usherPayoutPct: 0,
    usherReputation: 'MAJOR_PENALTY',
    suspendIfRepeat: true,
    lessProcessingFee: false,
  },
};

/** Resolve a cancellation outcome from the matrix. */
export function policyForCancellation(actor: CancelActor, window: CancelWindow): PolicyOutcome {
  return actor === 'CLIENT' ? CLIENT_CANCEL[window] : USHER_CANCEL[window];
}

/**
 * No-show (PRD §13): usher confirmed but neither client-verified nor
 * self-asserted by `event start + grace`. Client fully refunded, usher unpaid
 * and penalised.
 */
export const NO_SHOW_OUTCOME: PolicyOutcome = {
  clientRefundPct: 100,
  usherPayoutPct: 0,
  usherReputation: 'MAJOR_PENALTY',
  suspendIfRepeat: false,
  lessProcessingFee: false,
};

/** Default grace window (minutes) for both the no-show and auto-complete cutoffs (§12). */
export const DEFAULT_GRACE_MINUTES = 60;

/** Quote the active fee policy. Late-window settlement remains an approval gate.
 * Give the compensation the remainder so even odd-kobo allocations conserve gross.
 */
export function cancellationAmounts(gross: number, outcome: PolicyOutcome) {
  if (!Number.isSafeInteger(gross) || gross < 0) throw new Error('Invalid cancellation amount');
  const refundKobo = Math.floor((gross * outcome.clientRefundPct) / 100);
  if (outcome.lessProcessingFee)
    throw new Error('Refund fee deduction requires an approved ledger policy');
  return { refundKobo, usherCompensationKobo: gross - refundKobo, processingFeeKobo: 0 };
}
