/**
 * Welcome — matches Figma `Client / 01 Welcome` (18:100): a full-height emerald
 * gradient hero card (gold overline, Fraunces heading, body, feature chips) with
 * a primary "Get started" + ghost "I already have an account" below.
 */
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { DevLogin } from '../../components/DevLogin.js';
import { Loading } from '../../components/Loading.js';
import { useAuth } from '../../lib/auth-context.js';
import { shadowMd } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';

const CHIPS = ['Verified IDs', 'Escrow held', 'Check-in payout'];

export default function Welcome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'authed') return <Redirect href="/" />;

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box flex={1} style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 24 }}>
        <LinearGradient
          colors={['#0B6B53', '#0B6B53', '#15D1A2']}
          locations={[0, 0.62, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[{ flex: 1, borderRadius: 28, padding: 24, justifyContent: 'flex-end', gap: 16 }, shadowMd]}
        >
          <Text
            style={{
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 11,
              lineHeight: 14,
              letterSpacing: 1.2,
              color: primitives.gold[200],
            }}
          >
            TRUSTED EVENT STAFFING
          </Text>
          <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: '#FBF7F0' }}>
            Hire vetted ushers. Money held safe.
          </Text>
          <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, lineHeight: 22, color: primitives.emerald[100] }}>
            Book staff, pay into escrow, and release funds only when they check in on the day.
          </Text>
          <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
            {CHIPS.map((c) => (
              <Box key={c} style={{ backgroundColor: primitives.emerald[700], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2, color: '#FBF7F0' }}>
                  {c}
                </Text>
              </Box>
            ))}
          </Box>
        </LinearGradient>

        <Box style={{ gap: 12 }}>
          <Button label="Get started" onPress={() => router.push('/(auth)/role')} />
          <Button label="I already have an account" variant="ghost" onPress={() => router.push('/(auth)/phone')} />
        </Box>

        <DevLogin />
      </Box>
    </Box>
  );
}
