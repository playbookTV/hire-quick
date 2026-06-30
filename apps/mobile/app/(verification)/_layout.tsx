/**
 * Verification flow — first-class screens, NOT modals (critique P1). Identity
 * verification is a gated, linear onboarding journey (profile-setup → id-
 * verification → awaiting-approval, with verification-rejected on failure); as a
 * stack of swipe-dismissable modals it could be abandoned mid-step. Here it's a
 * card stack with gestures disabled, so progress is only made by the in-screen
 * actions. Ushers only.
 */
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

export default function VerificationLayout(): React.JSX.Element {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === 'CLIENT') return <Redirect href="/(client)/home" />;

  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
