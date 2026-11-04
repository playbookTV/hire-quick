/**
 * Brevo transactional transport — SMS (OTP delivery) + email (notifications),
 * via plain fetch. Isolated tests use a bounded in-memory recorder and never
 * send externally. Other runtimes never retain or log message payloads.
 */
import { env } from '../../env.js';
import { logger } from '../../logger.js';

import { record } from './test-recorder.js';
export { sentNotifications, clearSentNotifications, type SentRecord } from './test-recorder.js';

const IS_TEST = env.NODE_ENV === 'test';

function log(message: string): void {
  // Only fixed channel labels / HTTP status codes; never destinations or bodies.
  logger.warn(`[brevo] ${message}`);
}

async function providerFetch(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    // Fetch/SDK errors can embed headers, tokens or message bodies. Do not pass
    // their message/cause to callers or loggers.
    log('transport request failed');
    return null;
  }
}

/** Returns provider acceptance, or local acceptance in isolated test mode. */
export async function sendSms(to: string, text: string): Promise<boolean> {
  record({ kind: 'sms', to, summary: text });
  if (IS_TEST) return true;
  if (!env.BREVO_API_KEY) {
    log('SMS transport unavailable');
    return false;
  }
  const res = await providerFetch('https://api.brevo.com/v3/transactionalSMS/send', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      type: 'transactional',
      unicodeEnabled: true,
      sender: env.BREVO_SMS_SENDER,
      recipient: to,
      content: text,
    }),
  });
  if (!res) return false;
  if (!res.ok) {
    log(`SMS failed: ${String(res.status)}`);
    return false;
  }
  return true;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  record({ kind: 'email', to, summary: subject });
  if (IS_TEST) return true;
  if (!env.BREVO_API_KEY) {
    log('email transport unavailable');
    return false;
  }
  const res = await providerFetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'HireQuick', email: env.BREVO_EMAIL_SENDER },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res) return false;
  if (!res.ok) {
    log(`email failed: ${String(res.status)}`);
    return false;
  }
  return true;
}
