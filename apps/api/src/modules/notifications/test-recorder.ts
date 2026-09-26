/** Bounded delivery intent recorder for isolated tests; never stores production PII. */
import { env } from '../../env.js';

export interface SentRecord {
  kind: 'sms' | 'email' | 'push' | 'whatsapp';
  to: string;
  summary: string;
}

const IS_TEST = env.NODE_ENV === 'test';
const MAX_TEST_RECORDS = 100;
const sent: SentRecord[] = [];
export function record(r: SentRecord): void {
  if (!IS_TEST) return;
  if (sent.length >= MAX_TEST_RECORDS) sent.shift();
  sent.push({ ...r });
}
export function sentNotifications(): readonly SentRecord[] {
  return sent.map((entry) => ({ ...entry }));
}
export function clearSentNotifications(): void {
  sent.length = 0;
}
