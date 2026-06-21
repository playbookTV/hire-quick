/**
 * Modal stack guard. Only authed clients open these (create-event, and later
 * confirm-checkout / withdraw / checkin).
 */
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

export default function ModalsLayout(): React.JSX.Element {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
