/**
 * Brevo transactional transport — SMS (OTP delivery) + email (notifications),
 * via plain fetch. When BREVO_API_KEY is unset it logs (dev stub). Every send is
 * recorded so tests can assert intent without network.
 */
import { env } from '../../env.js';

export interface SentRecord {
  kind: 'sms' | 'email' | 'push';
  to: string;
  summary: string;
}

const sent: SentRecord[] = [];
export function sentNotifications(): readonly SentRecord[] {
  return sent;
}
export function clearSentNotifications(): void {
  sent.length = 0;
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[brevo] ${message}`);
}

export async function sendSms(to: string, text: string): Promise<void> {
  sent.push({ kind: 'sms', to, summary: text });
  if (!env.BREVO_API_KEY) {
    log(`(stub) SMS → ${to}: ${text}`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      type: 'transactional',
      unicodeEnabled: true,
      sender: env.BREVO_SMS_SENDER,
      recipient: to,
      content: text,
    }),
  });
  if (!res.ok) log(`SMS to ${to} failed: ${String(res.status)}`);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  sent.push({ kind: 'email', to, summary: subject });
  if (!env.BREVO_API_KEY) {
    log(`(stub) email → ${to}: ${subject}`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'HireQuick', email: 'no-reply@hirequick.app' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) log(`email to ${to} failed: ${String(res.status)}`);
}

/** FCM push is stubbed until creds; record intent so the lifecycle wiring is testable. */
export function recordPush(to: string, summary: string): void {
  sent.push({ kind: 'push', to, summary });
  log(`(stub) push → ${to}: ${summary}`);
}
