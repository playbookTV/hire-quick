/** WhatsApp OTP delivery via Twilio Programmable Messaging, not Twilio Verify. */
import { env } from '../../env.js';
import { record } from './test-recorder.js';

export function whatsappConfigured(): boolean {
  return !!(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_API_KEY_SID &&
    env.TWILIO_API_KEY_SECRET &&
    env.TWILIO_WHATSAPP_FROM &&
    env.TWILIO_WHATSAPP_CONTENT_SID
  );
}

/** True means provider acceptance, not confirmed handset delivery. */
export async function sendWhatsAppOtp(to: string, code: string): Promise<boolean> {
  record({ kind: 'whatsapp', to, summary: `OTP ${code}` });
  if (env.NODE_ENV === 'test') return true;
  if (!whatsappConfigured()) return false;
  if (!/^\+[1-9]\d{7,14}$/.test(to) || !/^\d{6}$/.test(code)) return false;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          To: `whatsapp:${to}`,
          From: env.TWILIO_WHATSAPP_FROM,
          ContentSid: env.TWILIO_WHATSAPP_CONTENT_SID,
          ContentVariables: JSON.stringify({ '1': code }),
        }).toString(),
      },
    );
    if (!response.ok) {
      console.log(`[twilio] WhatsApp request failed: ${String(response.status)}`);
      return false;
    }
    const message = (await response.json()) as {
      sid?: unknown;
      status?: unknown;
      error_code?: unknown;
    } | null;
    return (
      !!message &&
      typeof message.sid === 'string' &&
      /^SM[0-9a-fA-F]{32}$/.test(message.sid) &&
      typeof message.status === 'string' &&
      ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read'].includes(message.status) &&
      message.error_code == null
    );
  } catch {
    // Provider responses and thrown errors may contain credentials, recipients,
    // or OTPs. Never log their body, message, or cause.
    console.log('[twilio] WhatsApp transport request failed');
    return false;
  }
}
