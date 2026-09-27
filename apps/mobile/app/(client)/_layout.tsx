/**
 * Client tab shell + guard. Unauthed → welcome; ushers → their own home. Uses the
 * Figma-matched BottomNav. Tabs: Home / Discover / Events / Messages / Profile.
 */
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomNav } from '../../components/BottomNav.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

type FeatherName = keyof typeof Feather.glyphMap;
const icon =
  (name: FeatherName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Feather name={name} size={size} color={color} />
  );

export default function ClientLayout(): React.JSX.Element {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === 'USHER') return <Redirect href="/(usher)/home" />;
  if (!user.client?.displayName || user.client.displayName === user.phone)
    return <Redirect href="/(auth)/complete-profile" />;

  return (
    <Tabs tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: icon('message-circle') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
