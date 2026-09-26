/** Convert decimal naira text without silently rounding fractional kobo. */
export function parseNairaInput(text: string): number | null {
  const parts = text.trim().split('.');
  const whole = parts[0];
  const fraction = parts[1] ?? '';
  if (
    parts.length > 2 ||
    !/^\d+$/.test(whole) ||
    fraction.length > 2 ||
    (fraction !== '' && !/^\d+$/.test(fraction))
  )
    return null;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

export function nairaInput(kobo: number): string {
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
}
