/**
 * Usher Profile tab — matches Figma `Usher / 07 Reliability` (51:210), the
 * Profile destination in the usher tab bar: identity row, a three-stat summary,
 * a reliability-score breakdown, a "protect your standing" note, and recent
 * reviews. Stub data until the usher reputation API is wired.
 */
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Avatar } from '../../components/Avatar.js';
import { SectionHeader } from '../../components/SectionHeader.js';
import { ProgressBar } from '../../components/ProgressBar.js';
import { ReviewCard } from '../../components/ReviewCard.js';
import { Button } from '../../components/Button.js';
import { shadowSm } from '../../theme/shadows.js';
import { useAuth } from '../../lib/auth-context.js';
import type { Theme } from '../../theme/theme.js';

function Stat({ value, label, color }: { value: string; label: string; color: keyof Theme['colors'] }) {
  return (
    <Box flex={1} alignItems="center" style={{ gap: 2 }}>
      <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.066 }} color={color}>
        {value}
      </Text>
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
    </Box>
  );
}

function ScoreRow({ label, value, color = 'inkStrong' }: { label: string; value: string; color?: keyof Theme['colors'] }) {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between">
      <Text variant="body" color="inkMuted">
        {label}
      </Text>
      <Text variant="label" style={{ fontSize: 15 }} color={color}>
        {value}
      </Text>
    </Box>
  );
}

export default function UsherProfile(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* identity */}
        <Box flexDirection="row" alignItems="center" style={{ gap: 12 }}>
          <Avatar name="Ada Martins" size={52} />
          <Box flex={1} style={{ gap: 2 }}>
            <Text variant="headingS">Ada Martins</Text>
            <Text variant="bodySm" color="statusSuccess">
              Usher · Verified
            </Text>
          </Box>
        </Box>

        {/* summary stats */}
        <Box flexDirection="row" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={shadowSm}>
          <Stat value="4.9" label="Rating" color="accentGoldStrong" />
          <Stat value="120" label="Jobs done" color="inkStrong" />
          <Stat value="98%" label="Reliability" color="statusSuccess" />
        </Box>

        {/* reliability score */}
        <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="titleM">Reliability score</Text>
            <Text variant="amountM" color="statusSuccess">98%</Text>
          </Box>
          <ProgressBar progress={0.98} color="statusSuccess" />
          <ScoreRow label="On-time arrivals" value="118" />
          <ScoreRow label="Late cancellations" value="2" color="accentGoldStrong" />
          <ScoreRow label="No-shows" value="0" color="statusSuccess" />
        </Box>

        {/* protect standing */}
        <Box backgroundColor="brandEmeraldTintWeak" borderRadius="md" padding="400" style={{ gap: 4 }}>
          <Text variant="label" style={{ fontSize: 15 }} color="brandEmerald">
            Protect your standing
          </Text>
          <Text variant="bodySm" color="inkDefault">
            Cancelling within 24h of an event or not showing up lowers your reliability and ranking. Keep it high to win more invites.
          </Text>
        </Box>

        <SectionHeader title="Recent reviews" />
        <ReviewCard name="Sarah Johnson" date="2 weeks ago" comment="Punctual, polished and ran the welcome desk flawlessly." rating={5} />

        <Button label="Sign out" variant="ghost" onPress={() => logout()} />
      </ScrollView>
    </Box>
  );
}
