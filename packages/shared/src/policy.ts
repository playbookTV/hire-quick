import { eventInstant } from './booking-flow.js';
import { splitFee, kobo, PLATFORM_FEE_BPS, bookingAllocation } from './money.js';

/**
 * Cancellation / no-show / dispute POLICY MATRIX — the single source of truth
 * (PRD §13, TRD §21). Mobile, admin, and the ledger engine all import this so
 * they compute identical outcomes. Percentages are launch defaults (PRD §13).
 */

export type CancelWindow = 'GT_48H' | 'BETWEEN_12_48H' | 'LT_12H';
export type CancelActor = 'CLIENT' | 'USHER';

/**
 * Approved 21 September 2026: HireQuick bears unrecovered processing charges.
 * Never deduct a provider processing fee from the client refund.
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
   * refund. The approved launch policy always keeps this false.
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
    lessProcessingFee: DEDUCT_PROCESSING_FEE_ON_REFUND,
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

/** Quote the approved cancellation policy.
 * Give the compensation the remainder so even odd-kobo allocations conserve gross.
 */
export function cancellationAmounts(gross: number, outcome: PolicyOutcome) {
  if (!Number.isSafeInteger(gross) || gross < 0) throw new Error('Invalid cancellation amount');
  const refundKobo = Math.floor((gross * outcome.clientRefundPct) / 100);
  if (outcome.lessProcessingFee)
    throw new Error('Refund fee deduction requires an approved ledger policy');
  return { refundKobo, usherCompensationKobo: gross - refundKobo, processingFeeKobo: 0 };
}

/** Shared settlement deadline: the exact instant closes disputes and permits release. */
export const DISPUTE_WINDOW_HOURS = 72;
export function bookingReleaseAt(eventDate: Date | string, endTime: string): Date {
  return new Date(eventInstant(eventDate, endTime).getTime() + DISPUTE_WINDOW_HOURS * 3_600_000);
}
export function disputeWindowOpen(eventDate: Date | string, endTime: string, now: Date): boolean {
  return now.getTime() < bookingReleaseAt(eventDate, endTime).getTime();
}

/** Gross allocation is split only after computing the client's exact refund. */
export function cancellationSettlement(gross: number, outcome: PolicyOutcome, staffPay?: number | null) {
  if (staffPay != null) {
    // Refund both components at the same percentage, flooring each independently.
    // Their retained remainders belong to their original recipients.
    const allocation = bookingAllocation(gross, staffPay);
    const staff = cancellationAmounts(allocation.payout, outcome);
    const platform = cancellationAmounts(allocation.fee, outcome);
    return {
      refundKobo: staff.refundKobo + platform.refundKobo,
      usherCompensationKobo: staff.usherCompensationKobo + platform.usherCompensationKobo,
      processingFeeKobo: 0,
      platformFeeKobo: platform.usherCompensationKobo,
      usherPayoutKobo: staff.usherCompensationKobo,
    };
  }
  // Preserve the immutable terms of legacy bookings and cancellation receipts.
  const amounts = cancellationAmounts(gross, outcome);
  const { fee, payout } = splitFee(kobo(amounts.usherCompensationKobo), PLATFORM_FEE_BPS);
  return { ...amounts, platformFeeKobo: fee, usherPayoutKobo: payout };
}

/** Money exposure above this amount needs two distinct admin decisions. */
export const MONEY_APPROVAL_THRESHOLD_KOBO = 5_000_000;

/** Participant/admin projection of the durable cancellation; provider credentials stay server-side. */
export interface CancellationSummary {
  operationId: string;
  status: 'RECORDED' | 'FAILED' | 'PROCESSING' | 'AWAITING_APPROVAL';
  requestedAt: string;
  window: CancelWindow;
  refundKobo: number;
  usherCompensationKobo: number;
  platformFeeKobo: number;
  usherPayoutKobo: number;
  processingFeeKobo: number;
  requiresApproval: boolean;
}
