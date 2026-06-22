/**
 * Opening a real support conversation. Prefers WhatsApp (the channel Lagos
 * users actually live in — and the one the API already uses for OTP), falls
 * back to email, and only surfaces an in-app message if neither is configured.
 *
 * Configure via EXPO_PUBLIC_SUPPORT_WHATSAPP / EXPO_PUBLIC_SUPPORT_EMAIL.
 * Critique P0: the rejection screen's "Contact support" used to call
 * router.back() — offering help at the most vulnerable moment, then doing
 * nothing. This makes it actually reach someone.
 */
import { Linking, Alert } from 'react-native';
import { env } from './env.js';

async function tryOpen(url: string): Promise<boolean> {
  const can = await Linking.canOpenURL(url).catch(() => false);
  if (!can) return false;
  await Linking.openURL(url).catch(() => undefined);
  return true;
}

/** Open the best available support channel, prefilled with `message`. */
export async function openSupport(message = 'Hi HireQuick support, I need help with my account.'): Promise<void> {
  if (env.SUPPORT_WHATSAPP) {
    const ok = await tryOpen(`https://wa.me/${env.SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`);
    if (ok) return;
  }
  if (env.SUPPORT_EMAIL) {
    const ok = await tryOpen(
      `mailto:${env.SUPPORT_EMAIL}?subject=${encodeURIComponent('HireQuick support')}&body=${encodeURIComponent(message)}`,
    );
    if (ok) return;
  }
  Alert.alert(
    'Contact support',
    env.SUPPORT_EMAIL
      ? `Email us at ${env.SUPPORT_EMAIL} and we’ll help you sort this out.`
      : 'We couldn’t open a support channel on this device. Please reach out from the HireQuick website.',
  );
}
