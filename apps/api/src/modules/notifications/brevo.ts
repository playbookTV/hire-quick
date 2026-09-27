/**
 * Brevo transactional transport — SMS (OTP delivery) + email (notifications),
 * via plain fetch. Isolated tests use a bounded in-memory recorder and never
 * send externally. Other runtimes never retain or log message payloads.
 */
import { SignJWT, importPKCS8 } from 'jose';
import { env } from '../../env.js';

import { record } from './test-recorder.js';
export { sentNotifications, clearSentNotifications, type SentRecord } from './test-recorder.js';

const IS_TEST = env.NODE_ENV === 'test';

function log(message: string): void {
  // Only fixed channel labels / HTTP status codes; never destinations or bodies.
  console.log(`[brevo] ${message}`);
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

// ---- FCM push (HTTP v1) ----
function fcmConfigured(): boolean {
  return !!env.FCM_PROJECT_ID && !!env.FCM_CLIENT_EMAIL && !!env.FCM_PRIVATE_KEY;
}

// Cached service-account OAuth token (FCM v1 needs a Bearer token, ~1h-lived).
let fcmAuth: { token: string; expSec: number } | null = null;

async function fcmAccessToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (fcmAuth && fcmAuth.expSec - 60 > nowSec) return fcmAuth.token;
  // Service-account JWT-bearer grant → short-lived access token (Google OAuth2).
  const key = await importPKCS8(env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(env.FCM_CLIENT_EMAIL)
    .setSubject(env.FCM_CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 3600)
    .sign(key);
  const res = await providerFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res) throw new Error('FCM token exchange unavailable');
  if (!res.ok) throw new Error(`FCM token exchange failed: ${String(res.status)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmAuth = { token: json.access_token, expSec: nowSec + json.expires_in };
  return json.access_token;
}

async function sendFcm(to: string, summary: string): Promise<void> {
  const token = await fcmAccessToken();
  const res = await providerFetch(
    `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: { token: to, notification: { title: 'HireQuick', body: summary } },
      }),
    },
  );
  if (res && !res.ok) log(`push failed: ${String(res.status)}`);
}

/**
 * FCM push. Records intent only in isolated tests; otherwise configured FCM
 * credentials enable delivery via the FCM HTTP v1 API. Fire-and-forget —
 * a push failure must never block the action that triggered it — so the real
 * send is not awaited. Reports an unavailable transport when creds are unset (the
 * credentials themselves remain an external gap).
 */
export function recordPush(to: string, summary: string): void {
  record({ kind: 'push', to, summary });
  if (IS_TEST) return;
  if (!fcmConfigured()) {
    log('push transport unavailable');
    return;
  }
  void sendFcm(to, summary).catch(() => log('push delivery failed'));
}
