/** Convert decimal naira text without silently rounding fractional kobo. */
export function parseNairaInput(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

export function nairaInput(kobo: number): string {
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
}
