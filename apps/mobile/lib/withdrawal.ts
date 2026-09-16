import { withdrawalResponseSchema, type WithdrawalResponse, type WithdrawalStatus } from '@hq/shared';
import { z } from 'zod';
import { ApiError } from './api-error.js';

export type WithdrawalInput = { bankAccountId: string; amountKobo: number };
export type WithdrawalAttempt = z.infer<typeof attemptSchema>;

/** An unknown response must be resolved with the original key and payload. */
export function withdrawalAttempt(
  previous: WithdrawalAttempt | null,
  input: WithdrawalInput,
  makeKey: () => string,
): WithdrawalAttempt {
  if (!previous) return { key: makeKey(), input: { ...input } };
  if (previous.input.bankAccountId !== input.bankAccountId || previous.input.amountKobo !== input.amountKobo) {
    throw new Error('Check the previous withdrawal before changing its amount or account.');
  }
  return previous;
}

/** Only explicit pre-acceptance rejections make it safe to edit and start anew. */
export function withdrawalWasRejected(error: unknown): boolean {
  return error instanceof ApiError && error.status < 500 && [
    'VALIDATION', 'FORBIDDEN', 'NOT_AN_USHER', 'UNVERIFIED_ACCOUNT',
    'INSUFFICIENT_FUNDS', 'BAD_AMOUNT',
  ].includes(error.code);
}

const attemptSchema = z.object({
  key: z.string().min(8),
  input: z.object({ bankAccountId: z.string().uuid(), amountKobo: z.number().int().positive() }),
  outcome: withdrawalResponseSchema.optional(),
}).refine((attempt) => !attempt.outcome || (
  attempt.outcome.bankAccountId === attempt.input.bankAccountId &&
  attempt.outcome.amountKobo === attempt.input.amountKobo
), 'Saved receipt does not match its withdrawal request');

export interface WithdrawalStorage {
  read(userId: string): Promise<string | null>;
  write(userId: string, value: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

/** The uncertainty flag is derived from persisted state, not HTTP status alone. */
export class WithdrawalAttemptError extends Error {
  constructor(message: string, public readonly retryRequired: boolean) {
    super(message);
  }
}

export function createWithdrawalController(
  storage: WithdrawalStorage,
  send: (input: WithdrawalInput, key: string) => Promise<unknown>,
  makeKey: () => string,
) {
  const inFlight = new Map<string, { input: WithdrawalInput; promise: Promise<WithdrawalResponse> }>();
  const acknowledgments = new Map<string, { withdrawalId: string; promise: Promise<void> }>();
  const load = async (userId: string): Promise<WithdrawalAttempt | null> => {
    const saved = await storage.read(userId);
    // Corrupt/unreadable state blocks new dispatch rather than discarding a key.
    return saved === null ? null : attemptSchema.parse(JSON.parse(saved));
  };
  const run = async (userId: string, input: WithdrawalInput): Promise<WithdrawalResponse> => {
    const previous = await load(userId);
    const attempt = withdrawalAttempt(previous, input, makeKey);
    if (attempt.outcome) return attempt.outcome;
    // A crash after this checkpoint always resumes using the same key.
    if (!previous) await storage.write(userId, JSON.stringify(attempt));
    try {
      const outcome = withdrawalResponseSchema.parse(await send(attempt.input, attempt.key));
      if (outcome.bankAccountId !== attempt.input.bankAccountId || outcome.amountKobo !== attempt.input.amountKobo) {
        throw new Error('Withdrawal response does not match the saved request');
      }
      // Keep the receipt until the user acknowledges it. A crash after the API
      // response must reopen this receipt, not create another money intent.
      await storage.write(userId, JSON.stringify({ ...attempt, outcome }));
      return outcome;
    } catch (error) {
      if (!previous && withdrawalWasRejected(error)) {
        await storage.remove(userId);
        throw new WithdrawalAttemptError(error instanceof Error ? error.message : 'Check your withdrawal details.', false);
      }
      throw new WithdrawalAttemptError('We couldn’t confirm the outcome. Check the saved withdrawal before starting another.', true);
    }
  };
  return {
    load,
    acknowledge(userId: string, withdrawalId: string): Promise<void> {
      const pending = acknowledgments.get(userId);
      if (pending) {
        return pending.withdrawalId === withdrawalId ? pending.promise
          : Promise.reject(new Error('A different withdrawal receipt is being acknowledged.'));
      }
      if (inFlight.has(userId)) return Promise.reject(new Error('Wait for the withdrawal check to finish.'));
      const promise = (async () => {
        const saved = await load(userId);
        if (saved?.outcome?.withdrawalId !== withdrawalId) {
          throw new Error('This receipt does not match the saved withdrawal.');
        }
        await storage.remove(userId);
      })().finally(() => acknowledgments.delete(userId));
      acknowledgments.set(userId, { withdrawalId, promise });
      return promise;
    },
    submit(userId: string, input: WithdrawalInput): Promise<WithdrawalResponse> {
      if (acknowledgments.has(userId)) return Promise.reject(new Error('Wait for receipt acknowledgment to finish.'));
      const pending = inFlight.get(userId);
      if (pending) {
        if (pending.input.bankAccountId !== input.bankAccountId || pending.input.amountKobo !== input.amountKobo) {
          return Promise.reject(new WithdrawalAttemptError('Check the saved withdrawal before changing its details.', true));
        }
        return pending.promise;
      }
      const promise = run(userId, { ...input }).finally(() => inFlight.delete(userId));
      inFlight.set(userId, { input: { ...input }, promise });
      return promise;
    },
  };
}

export const withdrawalReceipt: Record<WithdrawalStatus, {
  title: string; description: string; amountLabel: string;
  tone: 'success' | 'danger' | 'info'; icon: 'check' | 'alert-circle' | 'clock';
}> = {
  REQUESTED: {
    title: 'Withdrawal requested',
    description: 'Your request is saved. The transfer has not been confirmed yet. Check your wallet for updates.',
    amountLabel: 'Amount requested', tone: 'info', icon: 'clock',
  },
  PROCESSING: {
    title: 'Transfer pending',
    description: 'Your withdrawal is being processed. Your bank has not confirmed completion yet. Check your wallet for updates.',
    amountLabel: 'Amount requested', tone: 'info', icon: 'clock',
  },
  PAID: {
    title: 'Transfer completed',
    description: 'Your bank transfer has been confirmed.',
    amountLabel: 'Amount sent', tone: 'success', icon: 'check',
  },
  FAILED: {
    title: 'Transfer unsuccessful',
    description: 'The withdrawal amount has been returned to your wallet. Check your bank details before trying again.',
    amountLabel: 'Amount returned', tone: 'danger', icon: 'alert-circle',
  },
};
