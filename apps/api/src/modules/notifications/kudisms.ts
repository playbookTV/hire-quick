/** Nigerian SMS OTP delivery through KudiSMS's approved corporate route. */
import { env } from '../../env.js';
import { record } from './test-recorder.js';

export function kudiSmsConfigured(): boolean {
  return !!(env.KUDISMS_API_KEY && env.KUDISMS_SENDER_ID);
}

/** True means provider acceptance, not confirmed handset delivery. */
export async function sendKudiSmsOtp(to: string, code: string): Promise<boolean> {
  // This endpoint is for Nigerian mobile numbers; do not silently send abroad.
  if (!/^\+234[789]\d{9}$/.test(to) || !/^\d{6}$/.test(code)) return false;
  const message = `Your HireQuick code is ${code}. It expires in 10 minutes.`;
  record({ kind: 'sms', to, summary: message });
  if (env.NODE_ENV === 'test') return true;
  if (!kudiSmsConfigured()) return false;

  try {
    const response = await fetch('https://my.kudisms.net/api/corporate', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        token: env.KUDISMS_API_KEY,
        senderID: env.KUDISMS_SENDER_ID,
        recipients: to.slice(1),
        message,
      }),
    });
    if (!response.ok) {
      console.log(`[kudisms] SMS request failed: ${String(response.status)}`);
      return false;
    }
    const result = (await response.json()) as {
      status?: unknown;
      error_code?: unknown;
      data?: unknown;
    } | null;
    // HTTP 200 can also carry a provider error. Require acceptance for this
    // recipient plus a message reference, using the documented corporate shape.
    return (
      result?.status === 'success' &&
      result.error_code === '000' &&
      typeof result.data === 'string' &&
      result.data.startsWith(`${to.slice(1)}|`) &&
      result.data.slice(to.length).trim().length > 0
    );
  } catch {
    // Responses and exceptions can echo the key, phone, or OTP. Never log them.
    console.log('[kudisms] SMS transport request failed');
    return false;
  }
}
