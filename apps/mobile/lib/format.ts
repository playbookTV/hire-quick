/**
 * Display formatters. Money formatting lives in `@hq/shared` (formatNaira); this
 * adds date/time helpers that don't depend on a full Intl/ICU build.
 */
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

/** Whole-naira ₦ string from kobo (no decimals), e.g. 1_500_000 → "₦15,000". */
export function money(k: number): string {
  const sign = k < 0 ? '−' : '';
  const whole = Math.floor(Math.abs(k) / 100);
  return `${sign}₦${whole.toLocaleString('en-NG')}`;
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
