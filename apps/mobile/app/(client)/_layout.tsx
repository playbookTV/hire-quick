/**
 * Client tab shell + guard. Unauthed → welcome; ushers → their own home. Tabs:
 * Home / Discover / Events / Messages / Profile.
 */
import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

type FeatherName = keyof typeof Feather.glyphMap;

export default function ClientLayout(): React.JSX.Element {
  const theme = useTheme();
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === 'USHER') return <Redirect href="/(usher)/home" />;

  const icon =
    (name: FeatherName) =>
    ({ color, size }: { color: string; size: number }) => <Feather name={name} size={size} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brandEmerald,
        tabBarInactiveTintColor: theme.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.bgSurface,
          borderTopColor: theme.colors.borderDefault,
        },
        tabBarLabelStyle: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: icon('message-circle') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
