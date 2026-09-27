import { z } from 'zod';
import { checkoutResponseSchema, type CheckoutResponse } from '@hq/shared';
import { ApiError } from './api-error.js';

const inputSchema = z.object({ applicationIds: z.array(z.string().uuid()).min(1).max(50), email: z.string().email().max(254) });
const attemptSchema = z.object({ key: z.string().min(8), eventId: z.string().uuid(), input: inputSchema, outcome: checkoutResponseSchema.optional() });
export type CheckoutInput = z.infer<typeof inputSchema>;
export type CheckoutAttempt = z.infer<typeof attemptSchema>;
export interface CheckoutStorage {
  read(scope: string): Promise<string | null>;
  write(scope: string, value: string): Promise<void>;
  remove(scope: string): Promise<void>;
}
export interface CheckoutTransport {
  confirm(eventId: string, input: CheckoutInput, key: string): Promise<unknown>;
  resume(orderId: string): Promise<unknown>;
  status(orderId: string): Promise<unknown>;
}

/** Fence UI effects across caller/event changes and unmount, including browser return. */
export function createCheckoutScopeFence() {
  let scope = '', generation = 0, active = true;
  return {
    activate(next: string): void { if (scope !== next || !active) { scope = next; generation++; } active = true; },
    invalidate(): void { active = false; generation++; },
    capture(): () => boolean { const captured = generation; return () => active && captured === generation; },
  };
}
const normalized = (input: CheckoutInput): CheckoutInput => ({ applicationIds: [...new Set(input.applicationIds)].sort(), email: input.email });
const rejectedBeforeAcceptance = (error: unknown): boolean => error instanceof ApiError && error.status < 500 && [
  'VALIDATION', 'FORBIDDEN', 'SELECTION_CHANGED', 'SCHEDULE_CONFLICT', 'ALREADY_CONFIRMED', 'EVENT_LOCKED', 'OVERBOOKED', 'PAYMENTS_UNAVAILABLE',
].includes(error.code);

/** One persisted intent per caller/event. Browser cancellation never deletes or rotates it. */
export function createCheckoutController(storage: CheckoutStorage, transport: CheckoutTransport, makeKey: () => string) {
  const pending = new Map<string, Promise<unknown>>();
  const scope = (userId: string, eventId: string): string => `${userId}.${eventId}`;
  const load = async (userId: string, eventId: string): Promise<CheckoutAttempt | null> => {
    const raw = await storage.read(scope(userId, eventId));
    if (raw === null) return null;
    const saved = attemptSchema.parse(JSON.parse(raw));
    if (saved.eventId !== eventId || (saved.outcome && saved.outcome.eventId !== eventId)) throw new Error('Saved checkout does not match this event.');
    return saved;
  };
  const exclusive = async <T>(id: string, work: () => Promise<T>): Promise<T> => {
    if (pending.has(id)) throw new Error('A checkout action is already in progress.');
    const promise = work().finally(() => pending.delete(id));
    pending.set(id, promise);
    return promise;
  };
  const saveOutcome = async (id: string, saved: CheckoutAttempt, raw: unknown): Promise<CheckoutResponse> => {
    const outcome = checkoutResponseSchema.parse(raw);
    if (outcome.eventId !== saved.eventId || (saved.outcome && (outcome.orderId !== saved.outcome.orderId || outcome.reference !== saved.outcome.reference))) throw new Error('Checkout response does not match the saved order.');
    await storage.write(id, JSON.stringify({ ...saved, outcome }));
    return outcome;
  };
  return {
    load,
    submit(userId: string, eventId: string, input: CheckoutInput): Promise<CheckoutResponse> {
      const id = scope(userId, eventId);
      return exclusive(id, async () => {
        const previous = await load(userId, eventId);
        const clean = normalized(inputSchema.parse(input));
        if (previous && JSON.stringify(normalized(previous.input)) !== JSON.stringify(clean)) throw new Error('Resume the saved checkout before changing the staff or payment details.');
        const attempt: CheckoutAttempt = previous ?? { key: makeKey(), eventId, input: clean };
        if (!previous) await storage.write(id, JSON.stringify(attempt));
        try {
          const result = attempt.outcome
            ? await transport.resume(attempt.outcome.orderId)
            : await transport.confirm(eventId, attempt.input, attempt.key);
          return await saveOutcome(id, attempt, result);
        } catch (error) {
          // A rejection during a later retry cannot disprove earlier acceptance.
          if (!previous && rejectedBeforeAcceptance(error)) await storage.remove(id);
          throw error;
        }
      });
    },
    refresh(userId: string, eventId: string): Promise<CheckoutResponse> {
      const id = scope(userId, eventId);
      return exclusive(id, async () => {
        const saved = await load(userId, eventId);
        if (!saved) throw new Error('No saved checkout.');
        return saveOutcome(id, saved, saved.outcome
          ? await transport.status(saved.outcome.orderId)
          : await transport.confirm(eventId, saved.input, saved.key));
      });
    },
    acknowledge(userId: string, eventId: string, orderId: string): Promise<void> {
      const id = scope(userId, eventId);
      return exclusive(id, async () => {
        const saved = await load(userId, eventId);
        if (saved?.outcome?.orderId !== orderId || !['PAID', 'EXPIRED', 'REFUNDED'].includes(saved.outcome.state)) throw new Error('This checkout is still unresolved.');
        await storage.remove(id);
      });
    },
  };
}

export const checkoutCopy: Record<CheckoutResponse['state'], { title: string; body: string }> = {
  CREATED: { title: 'Checkout saved', body: 'Continue with the original staff selection and payment.' },
  INITIALIZING: { title: 'Starting payment', body: 'Your order is saved. Check its status before starting another payment.' },
  READY: { title: 'Payment not confirmed', body: 'Resume the original Paystack checkout or check whether your payment has arrived. Closing the browser keeps this order saved.' },
  REVIEW: { title: 'Payment needs checking', body: 'We cannot yet confirm this payment. Your original order is saved and its staff reservation is retained. Check again or contact support with the order number.' },
  EXPIRED: { title: 'Reservation expired', body: 'The unpaid staff reservation has been released. Any payment arriving later will be refunded without confirming these staff.' },
  PAID: { title: 'Payment confirmed', body: 'Your payment was received and the staff bookings were confirmed.' },
  REFUND_PENDING: { title: 'Refund pending', body: 'Payment arrived after the reservation expired. These staff were not confirmed; your refund is being processed.' },
  REFUNDED: { title: 'Refund completed', body: 'The payment for this expired reservation has been refunded.' },
};
