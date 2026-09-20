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
import { fonts } from '../../theme/fonts.js';

// Figma hero gradient stop — intentionally sits outside the primitives emerald ramp
// (it maps to the gradient's lower bound in the design file, not a standalone colour).
const HERO_GRADIENT_TINT = '#15D1A2';

const CHIPS = ['Verified IDs', 'Money held safe', 'Check-in payout'];

export default function Welcome(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'authed') return <Redirect href="/" />;

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box
        flex={1}
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          gap: 24,
        }}
      >
        <LinearGradient
          colors={[primitives.emerald[600], primitives.emerald[600], HERO_GRADIENT_TINT]}
          locations={[0, 0.62, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            { flex: 1, borderRadius: 28, padding: 24, justifyContent: 'flex-end', gap: 16 },
            shadowMd,
          ]}
        >
          <Text
            style={{
              fontFamily: fonts.sansBold,
              fontSize: 11,
              lineHeight: 14,
              letterSpacing: 1.2,
              color: primitives.gold[200],
            }}
          >
            TRUSTED EVENT STAFFING
          </Text>
          <Text
            style={{
              fontFamily: fonts.displaySemibold,
              fontSize: 26,
              lineHeight: 32,
              letterSpacing: -0.5,
              color: primitives.neutral[50],
            }}
          >
            Hire vetted ushers. Money held safe.
          </Text>
          <Text
            style={{
              fontFamily: fonts.sansRegular,
              fontSize: 15,
              lineHeight: 22,
              color: primitives.emerald[100],
            }}
          >
            Book staff, pay upfront, and we hold the money safely — released after attendance is
            recorded and the booking is completed.
          </Text>
          <Box flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
            {CHIPS.map((c) => (
              <Box
                key={c}
                style={{
                  backgroundColor: primitives.emerald[700],
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sansSemibold,
                    fontSize: 13,
                    lineHeight: 16,
                    letterSpacing: 0.2,
                    color: primitives.neutral[50],
                  }}
                >
                  {c}
                </Text>
              </Box>
            ))}
          </Box>
        </LinearGradient>

        <Box style={{ gap: 12 }}>
          <Button label="Get started" onPress={() => router.push('/(auth)/role')} />
          <Button
            label="I already have an account"
            variant="ghost"
            onPress={() => router.push('/(auth)/phone')}
          />
        </Box>

        <Button
          label="Privacy policy"
          variant="ghost"
          onPress={() => router.push('/privacy-policy')}
        />
        <DevLogin />
      </Box>
    </Box>
  );
}
