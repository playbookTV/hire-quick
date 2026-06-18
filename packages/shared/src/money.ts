/**
 * Money is represented as integer **kobo** (₦1 = 100 kobo). Never floats — a
 * fractional drift silently breaks the ledger `Σ == 0` invariant (TRD §25).
 */
export type Kobo = number & { readonly __brand: 'Kobo' };

export class MoneyError extends Error {}

/** Construct a Kobo value, asserting it is a safe non-negative integer. */
export function kobo(n: number): Kobo {
  if (!Number.isInteger(n)) throw new MoneyError(`kobo must be an integer, got ${n}`);
  if (!Number.isSafeInteger(n)) throw new MoneyError(`kobo out of safe integer range: ${n}`);
  return n as Kobo;
}

/** Convert whole naira to kobo. */
export function naira(n: number): Kobo {
  return kobo(Math.round(n * 100));
}

export function addKobo(...xs: Kobo[]): Kobo {
  return kobo(xs.reduce<number>((a, b) => a + b, 0));
}

export function subKobo(a: Kobo, b: Kobo): Kobo {
  return kobo(a - b);
}

export function sumKobo(xs: readonly Kobo[]): Kobo {
  return kobo(xs.reduce<number>((a, b) => a + b, 0));
}

/**
 * Split a gross amount into the platform fee and the usher payout using basis
 * points. The fee is floored and the payout is the exact remainder, so
 * `fee + payout === gross` always holds (no rounding leak). 15% = 1500 bps.
 */
export function splitFee(gross: Kobo, feeBps: number): { fee: Kobo; payout: Kobo } {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new MoneyError(`feeBps must be an integer in [0, 10000], got ${feeBps}`);
  }
  const fee = kobo(Math.floor((gross * feeBps) / 10_000));
  const payout = subKobo(gross, fee);
  return { fee, payout };
}

/**
 * Apply a whole-number percentage to an amount (floored). Used by the
 * cancellation policy to compute refund/payout splits. The caller is
 * responsible for ensuring the complementary side is the remainder when the
 * two must sum to the gross.
 */
export function pctOf(amount: Kobo, pct: number): Kobo {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    throw new MoneyError(`pct must be an integer in [0, 100], got ${pct}`);
  }
  return kobo(Math.floor((amount * pct) / 100));
}

/** Format kobo as a ₦ string for display/logging (not for math). */
export function formatNaira(amount: Kobo): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}₦${whole.toLocaleString('en-NG')}.${frac}`;
}

export const ZERO = kobo(0);
export const PLATFORM_FEE_BPS = 1500; // 15% (TRD §6 / EXEC §6)
