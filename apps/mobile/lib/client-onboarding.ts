import { clientCanHire } from '@hq/shared';
import type { Me } from './types.js';

export function clientOnboardingRoute(user: Me) {
  if (user.role !== 'CLIENT') return null;
  if (!user.client?.displayName || user.client.displayName === user.phone)
    return '/(auth)/complete-profile' as const;
  if (!user.client.accountType) return '/(verification)/account-type' as const;
  if (!clientCanHire(user.client)) return '/(verification)/client-verification' as const;
  return null;
}
