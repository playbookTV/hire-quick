/**
 * Entry redirect. Sends the user to onboarding, the client tabs, or the usher
 * tabs based on hydrated auth state. Group layouts re-assert these guards.
 */
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth-context.js';
import { Loading } from '../components/Loading.js';

export default function Index(): React.JSX.Element {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (
    user.role === 'CLIENT' &&
    (!user.client?.displayName || user.client.displayName === user.phone)
  )
    return <Redirect href="/(auth)/complete-profile" />;
  if (user.role === 'USHER' && (!user.usher?.displayName || !user.usher.bio))
    return <Redirect href="/(verification)/profile-setup" />;
  if (user.role === 'USHER') return <Redirect href="/(usher)/home" />;
  return <Redirect href="/(client)/home" />;
}
