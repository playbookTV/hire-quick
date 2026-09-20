/**
 * Usher tab shell + guard. Unauthed → welcome; clients → their own home. Uses the
 * Figma-matched BottomNav. Tabs: Home / Jobs / Messages / Wallet / Profile.
 * Calendar stays routable (reached from Home + Profile) but is off the tab bar so
 * the five-slot bar can carry Messages.
 */
import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BottomNav } from '../../components/BottomNav.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

type FeatherName = keyof typeof Feather.glyphMap;
const icon =
  (name: FeatherName) =>
  ({ color, size }: { color: string; size: number }) => (
    <Feather name={name} size={size} color={color} />
  );

export default function UsherLayout(): React.JSX.Element {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === 'CLIENT') return <Redirect href="/(client)/home" />;
  if (!user.usher?.displayName || !user.usher.bio)
    return <Redirect href="/(verification)/profile-setup" />;

  return (
    <Tabs tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('briefcase') }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: icon('message-circle') }}
      />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: icon('credit-card') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
      {/* Calendar stays routable but off the bar (reached from Home + Profile). */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}
