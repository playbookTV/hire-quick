/**
 * Brevo transactional transport — SMS (OTP delivery) + email (notifications),
 * via plain fetch. When BREVO_API_KEY is unset it logs (dev stub). Every send is
 * recorded so tests can assert intent without network.
 */
import { env } from '../../env.js';

export interface SentRecord {
  kind: 'sms' | 'email' | 'push' | 'whatsapp';
  to: string;
  summary: string;
}

// Test-only intent log. NEVER record in production: this is a module-level array
// that would otherwise retain every phone/email/push token/OTP forever (PII +
// unbounded memory growth).
const RECORDING = env.NODE_ENV !== 'production';
const sent: SentRecord[] = [];
function record(r: SentRecord): void {
  if (RECORDING) sent.push(r);
}
export function sentNotifications(): readonly SentRecord[] {
  return sent;
}
export function clearSentNotifications(): void {
  sent.length = 0;
}

function log(message: string): void {
   
  console.log(`[brevo] ${message}`);
}

/** Returns whether the message was accepted by the provider (true on dev stub). */
export async function sendSms(to: string, text: string): Promise<boolean> {
  record({ kind: 'sms', to, summary: text });
  if (!env.BREVO_API_KEY) {
    log(`(stub) SMS → ${to}: ${text}`);
    return true;
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
  if (!res.ok) {
    log(`SMS to ${to} failed: ${String(res.status)}`);
    return false;
  }
  return true;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  record({ kind: 'email', to, summary: subject });
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

/**
 * WhatsApp OTP via Brevo — the preferred OTP channel (TRD §4). Requires a
 * connected WhatsApp Business Account + an approved authentication template
 * (Meta rule: the first/transactional message must be a template). The code is
 * injected into the template variable named by BREVO_WHATSAPP_OTP_PARAM. Until
 * the WABA + template are configured it logs a dev stub.
 *
 * NOTE: Brevo does not publicly document the WhatsApp `params` shape; this sends
 * `params: { <BREVO_WHATSAPP_OTP_PARAM>: code }`. Confirm against the approved
 * template once it exists and adjust the param mapping if Brevo expects a
 * different key (e.g. a positional "1").
 */
export async function sendWhatsAppOtp(to: string, code: string): Promise<boolean> {
  record({ kind: 'whatsapp', to, summary: `OTP ${code}` });
  const configured =
    !!env.BREVO_API_KEY && !!env.BREVO_WHATSAPP_SENDER && env.BREVO_WHATSAPP_OTP_TEMPLATE_ID > 0;
  if (!configured) {
    log(`(stub) whatsapp → ${to}: OTP ${code}`);
    return true;
  }
  const recipient = to.replace(/\D/g, ''); // Brevo wants digits only, incl. country code
  const res = await fetch('https://api.brevo.com/v3/whatsapp/sendMessage', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      senderNumber: env.BREVO_WHATSAPP_SENDER,
      contactNumbers: [recipient],
      templateId: env.BREVO_WHATSAPP_OTP_TEMPLATE_ID,
      params: { [env.BREVO_WHATSAPP_OTP_PARAM]: code },
    }),
  });
  if (!res.ok) {
    log(`whatsapp OTP to ${to} failed: ${String(res.status)}`);
    return false;
  }
  return true;
}

/** FCM push is stubbed until creds; record intent so the lifecycle wiring is testable. */
export function recordPush(to: string, summary: string): void {
  record({ kind: 'push', to, summary });
  log(`(stub) push → ${to}: ${summary}`);
}
