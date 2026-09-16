import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuth } from '../../lib/auth-context.js';

export default function AuthLayout(): React.JSX.Element {
  const { status, user } = useAuth();
  const segments = useSegments();
  // The existing completion screen checks required profile fields and redirects
  // completed profiles through the role-aware index route.
  if (status === 'authed' && user && segments[segments.length - 1] !== 'complete-profile') {
    return <Redirect href="/(auth)/complete-profile" />;
  }
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
