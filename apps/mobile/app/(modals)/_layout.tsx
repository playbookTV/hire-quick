/**
 * Modal stack guard. Only authed clients open these (create-event, and later
 * confirm-checkout / withdraw / checkin).
 */
import { Redirect, Stack, useSegments } from 'expo-router';
import { clientOnboardingRoute } from '../../lib/client-onboarding.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

export default function ModalsLayout(): React.JSX.Element {
  const { status, user } = useAuth();
  const segments = useSegments();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  const onboarding = clientOnboardingRoute(user);
  const permitted = new Set([
    'my-bookings',
    'booking-details',
    'message-thread',
    'check-in',
    'dispute',
    'cancellation',
    'rate-staff',
    'privacy-data',
    'account-settings',
  ]);
  if (onboarding && !permitted.has(segments[segments.length - 1] ?? ''))
    return <Redirect href={onboarding} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
