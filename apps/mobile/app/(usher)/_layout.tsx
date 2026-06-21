/**
 * Usher tab shell + guard. Unauthed → welcome; clients → their own home. Tabs:
 * Home / Jobs / Calendar / Wallet / Profile.
 */
import { Redirect, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../theme/restyle.js';
import { useAuth } from '../../lib/auth-context.js';
import { Loading } from '../../components/Loading.js';

type FeatherName = keyof typeof Feather.glyphMap;

export default function UsherLayout(): React.JSX.Element {
  const theme = useTheme();
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'guest' || !user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === 'CLIENT') return <Redirect href="/(client)/home" />;

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
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('briefcase') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: icon('credit-card') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
