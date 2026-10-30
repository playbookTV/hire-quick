/** Normalize the two Nigerian phone formats accepted by the phone screen. */
export function nigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s()+.-]/g, '');
  const local = digits.startsWith('234')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return /^[789]\d{9}$/.test(local) ? `+234${local}` : null;
}

/** Complete weeks keep dates aligned at every viewport width. */
export function calendarWeeks(year: number, month: number): Array<Array<number | null>> {
  const start = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((start + days) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, column) => {
      const day = week * 7 + column - start + 1;
      return day > 0 && day <= days ? day : null;
    }),
  );
}

export type AvailabilityDayState = 'default' | 'available' | 'busy' | 'job';

/** Count each visible date once, using the same booked-day precedence as the cells. */
export function summarizeAvailability(
  daysInMonth: number,
  stateOf: (day: number) => AvailabilityDayState,
) {
  const counts = { available: 0, busy: 0, job: 0 };
  for (let day = 1; day <= daysInMonth; day += 1) {
    const state = stateOf(day);
    if (state !== 'default') counts[state] += 1;
  }
  return counts;
}
