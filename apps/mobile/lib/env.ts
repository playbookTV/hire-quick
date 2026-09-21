/**
 * Public runtime config. `EXPO_PUBLIC_*` vars are inlined into the bundle by
 * Expo at build time. Physical devices must point at the machine's LAN IP, not
 * localhost (see .env.example).
 */
/** Read an EXPO_PUBLIC_* var as a string (process.env is loosely typed as any). */
function envStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

const API_URL = envStr(process.env.EXPO_PUBLIC_API_URL, 'http://localhost:4000');

export const env = {
  API_URL: API_URL.replace(/\/$/, ''),
  /** Show developer tools only in development builds. */
  IS_DEV: __DEV__,
  /** Support WhatsApp in E.164 digits only, e.g. "2348012345678" (no "+"). */
  SUPPORT_WHATSAPP: envStr(process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP).replace(/[^\d]/g, ''),
  /** Support email, used if WhatsApp isn't configured/installed. */
  SUPPORT_EMAIL: envStr(process.env.EXPO_PUBLIC_SUPPORT_EMAIL),
} as const;
