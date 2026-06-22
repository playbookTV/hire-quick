/**
 * Public runtime config. `EXPO_PUBLIC_*` vars are inlined into the bundle by
 * Expo at build time. Physical devices must point at the machine's LAN IP, not
 * localhost (see .env.example).
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const env = {
  API_URL: API_URL.replace(/\/$/, ''),
  /** Dev convenience: the API echoes the OTP as `devCode` when SMS isn't wired. */
  IS_DEV: __DEV__,
  /** Support WhatsApp in E.164 digits only, e.g. "2348012345678" (no "+"). */
  SUPPORT_WHATSAPP: (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/[^\d]/g, ''),
  /** Support email, used if WhatsApp isn't configured/installed. */
  SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
} as const;
