/** Weekly payout run view model: labels and which actions a run allows. */
import type {
  PayoutExclusionReason,
  PayoutLineFlag,
  PayoutRunStatus,
  PayoutSkipReason,
} from '@hq/shared';

export interface PayoutRunSummary {
  id: string;
  periodKey: string;
  status: PayoutRunStatus;
  builtAt: string;
  lineCount: number;
  totalKobo: number;
  submittedAt: string | null;
  approvedAt: string | null;
  executedAt: string | null;
}

export interface PayoutRunLineView {
  usherId: string;
  usherName: string;
  amountKobo: number;
  flags: PayoutLineFlag[];
  bank: { bankCode: string; accountName: string; last4: string } | null;
  withdrawal: { id: string; status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED'; amountKobo: number; reference: string | null; updatedAt: string } | null;
  skipReason: PayoutSkipReason | null;
}

export interface PayoutRunView {
  id: string;
  periodKey: string;
  status: PayoutRunStatus;
  builtAt: string;
  linesHash: string;
  totalKobo: number;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  lines: PayoutRunLineView[];
  excluded: { usherId: string; usherName: string; balanceKobo: number; reason: PayoutExclusionReason }[];
  summary: { paid: number; processing: number; failed: number; notSent: number };
}

export const RUN_STATUS_LABEL: Record<PayoutRunStatus, string> = {
  DRAFT: 'Draft · needs review',
  AWAITING_APPROVAL: 'Waiting for a second admin',
  APPROVED: 'Approved · creating payouts',
  EXECUTED: 'Sent to Paystack',
  CANCELLED: 'Skipped',
};

export const FLAG_LABEL: Record<PayoutLineFlag, string> = {
  NEW_PAYOUT_ACCOUNT: 'New payout account',
  FIRST_PAYOUT: 'First payout',
};

/** Longer explanation shown on hover and to screen readers. */
export const FLAG_HELP: Record<PayoutLineFlag, string> = {
  NEW_PAYOUT_ACCOUNT: 'The usher chose this payout account in the last 7 days. Confirm the account name matches the usher.',
  FIRST_PAYOUT: 'This usher has never been paid out before.',
};

export const EXCLUSION_LABEL: Record<PayoutExclusionReason, string> = {
  BELOW_MINIMUM: 'Below the ₦1,000 minimum · rolls over',
  NO_PAYOUT_ACCOUNT: 'No payout account',
  ACCOUNT_NOT_VERIFIED: 'Payout account not verified',
  ACCOUNT_NOT_BVN_VERIFIED: 'Payout account BVN not verified',
  NO_TRANSFER_RECIPIENT: 'Payout account not registered with Paystack',
  USER_SUSPENDED: 'Account suspended',
  USER_CLOSED: 'Account closed',
};

export const SKIP_LABEL: Record<PayoutSkipReason, string> = {
  ACCOUNT_CHANGED: 'Not sent · payout account changed after approval',
  INSUFFICIENT_BALANCE: 'Not sent · balance lower than approved',
  USER_SUSPENDED: 'Not sent · account suspended',
  USER_CLOSED: 'Not sent · account closed',
};

/** What a line's payout status means to an operator. */
export function lineStatus(line: PayoutRunLineView, runStatus: PayoutRunStatus): string {
  if (line.skipReason) return SKIP_LABEL[line.skipReason];
  if (!line.withdrawal) return runStatus === 'EXECUTED' ? 'Not sent' : 'Not sent yet';
  switch (line.withdrawal.status) {
    case 'PAID':
      return 'Paid';
    case 'FAILED':
      return 'Failed · back in wallet';
    default:
      return 'Waiting for code or bank';
  }
}

/** A line can take an OTP only once its withdrawal exists and has not settled. */
export function lineAwaitsCode(line: PayoutRunLineView): boolean {
  return line.withdrawal?.status === 'PROCESSING';
}

export function runActions(run: Pick<PayoutRunView, 'status' | 'lines'>) {
  return {
    refresh: run.status === 'DRAFT',
    submit: run.status === 'DRAFT' && run.lines.length > 0,
    cancel: run.status === 'DRAFT',
    approve: run.status === 'AWAITING_APPROVAL',
    sendBack: run.status === 'AWAITING_APPROVAL',
    sendAgain: run.status === 'APPROVED' || (run.status === 'EXECUTED' && run.lines.some(lineAwaitsCode)),
  };
}
