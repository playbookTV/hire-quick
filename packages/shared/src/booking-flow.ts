import type { BookingStatus } from './enums.js';

/** Event dates are calendar dates; entered times are Lagos time (UTC+1). */
export function eventInstant(date: Date | string, time: string): Date {
  const instant = new Date(date);
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  instant.setUTCHours(hours - 1, minutes, 0, 0);
  return instant;
}

export function staffingCounts(headcount: number, statuses: readonly BookingStatus[]) {
  const reserved = statuses.filter((status) => status === 'PENDING_PAYMENT').length;
  const vacated = statuses.filter((status) =>
    ['CANCELLED', 'REFUNDED', 'NO_SHOW'].includes(status),
  ).length;
  const confirmed = statuses.length - reserved - vacated;
  return { confirmed, reserved, vacated, available: Math.max(0, headcount - confirmed - reserved) };
}
