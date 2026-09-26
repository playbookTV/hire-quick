/** All existing support entry points open the same hosted Crisp inbox. */
import { Linking, Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { env } from './env.js';
import { createCrispSupport } from './crisp-support.js';

const crisp = createCrispSupport({
  websiteId: env.CRISP_WEBSITE_ID,
  // Lazy loading lets older native builds use the fallback without crashing startup.
  load: () => import('crisp-sdk-react-native'),
  async tokenFor(userId) {
    const key = `hq.crisp.${env.CRISP_WEBSITE_ID}.${userId}`;
    const existing = await SecureStore.getItemAsync(key);
    if (existing) return existing;
    const token = randomUUID();
    await SecureStore.setItemAsync(key, token);
    return token;
  },
});

export const setSupportUser = crisp.setUser;

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openSupport(
  message = 'Hi HireQuick support, I need help with my account.',
): Promise<void> {
  if (env.CRISP_WEBSITE_ID && Platform.OS !== 'web') {
    try {
      await crisp.open(message);
      return;
    } catch {
      // Missing native module or failed launch: offer configured contact alternatives.
    }
  }
  if (
    env.SUPPORT_WHATSAPP &&
    (await tryOpen(`https://wa.me/${env.SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`))
  )
    return;
  if (
    env.SUPPORT_EMAIL &&
    (await tryOpen(
      `mailto:${env.SUPPORT_EMAIL}?subject=${encodeURIComponent('HireQuick support')}&body=${encodeURIComponent(message)}`,
    ))
  )
    return;
  Alert.alert(
    'Support chat unavailable',
    env.SUPPORT_EMAIL
      ? `Email us at ${env.SUPPORT_EMAIL} and we’ll help you sort this out.`
      : 'We couldn’t open support chat. Please try again with the latest version of HireQuick.',
  );
}
