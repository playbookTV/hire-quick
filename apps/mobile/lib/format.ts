/**
 * Display formatters. Money formatting lives in `@hq/shared` (formatNaira) — re-exported
 * here as `money` so every surface renders identical strings; this file adds date/time
 * helpers that don't depend on a full Intl/ICU build.
 */
import { formatNaira, type Kobo } from '@hq/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sat, 21 Jun 2026" */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2:00 PM – 10:00 PM" from "14:00"/"22:00". */
export function formatTimeRange(start: string, end: string): string {
  return `${to12h(start)} – ${to12h(end)}`;
}

function to12h(hhmm: string): string {
  const [hStr, m] = hhmm.split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

/**
 * ₦ display string from kobo, e.g. 1_500_000 → "₦15,000.00".
 * Delegates to the canonical `@hq/shared` formatter so every surface in the app
 * renders identical money (was previously a local whole-naira variant that
 * disagreed with `formatNaira` inside the pay funnel — C3).
 */
export function money(k: number): string {
  // Mobile amounts are plain `number` kobo; `formatNaira` wants the branded `Kobo`.
  // The brand is compile-time only (runtime is a number), so the cast is safe.
  return formatNaira(k as Kobo);
}

/** Signed ₦ for wallet activity rows: credit "+₦…", debit "−₦…", pending plain. */
export function signedMoney(k: number, type: 'credit' | 'debit' | 'pending'): string {
  if (type === 'credit') return `+${money(Math.abs(k))}`;
  if (type === 'debit') return `−${money(Math.abs(k))}`;
  return money(Math.abs(k));
}

/** "Sat 12 Jul" from an ISO date string. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sat 12 Jul · 4:00 PM" combining an event date with an "HH:MM" start time. */
export function dateTime(iso: string, hhmm?: string): string {
  const base = shortDate(iso);
  return hhmm ? `${base} · ${to12h(hhmm)}` : base;
}

/** "2:30 PM" — clock time from a full ISO timestamp (for chat bubbles). */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

/** "Today" / "Yesterday" / "Sat 12 Jul" — day-separator label for a timestamp. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return shortDate(iso);
}
