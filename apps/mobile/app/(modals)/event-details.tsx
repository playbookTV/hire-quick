/**
 * Job Details (usher) — matches Figma `Usher / 03 Event Details` (47:130):
 * title + pay, a host card, a details card (date/venue/dress/slots), a
 * requirements list, and a Save / Apply-now bar. Static preview until the usher
 * jobs API is wired.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Icon, type IconName } from '../../components/Icon.js';
import type { Theme } from '../../theme/theme.js';

function DetailRow({ icon, label, value, valueColor = 'inkStrong' }: { icon: IconName; label: string; value: string; valueColor?: keyof Theme['colors'] }) {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between">
      <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
        <Icon name={icon} size={18} color="inkMuted" />
        <Text variant="body" color="inkMuted">
          {label}
        </Text>
      </Box>
      <Text variant="label" style={{ fontSize: 15 }} color={valueColor}>
        {value}
      </Text>
    </Box>
  );
}

const REQUIREMENTS = [
  'Arrive 30 min before guests for briefing',
  'Manage welcome desk & guest seating',
  'Professional, friendly presentation',
];

export default function EventDetails(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Job details" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 20 }}>
          {/* title + pay */}
          <Box style={{ gap: 4 }}>
            <Text variant="h1">Adeola’s Wedding</Text>
            <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 28, letterSpacing: -0.3 }} color="brandEmerald">
                ₦15,000
              </Text>
              <Text variant="body" color="inkMuted">/ head</Text>
            </Box>
          </Box>

          {/* host */}
          <Box flexDirection="row" alignItems="center" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="md" padding="400" style={{ gap: 12 }}>
            <Avatar name="Sarah Johnson" size={40} />
            <Box flex={1}>
              <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
                Sarah Johnson
              </Text>
              <Box flexDirection="row" alignItems="center" style={{ gap: 3 }}>
                <Icon name="star" size={14} color="accentGold" />
                <Text variant="bodySm" color="inkMuted">
                  4.8 · 12 events hosted
                </Text>
              </Box>
            </Box>
            <Text variant="label" style={{ fontSize: 13 }} color="statusSuccess">
              Verified
            </Text>
          </Box>

          {/* details */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <DetailRow icon="calendar" label="Date & time" value="Sat 12 Jul · 4–10 PM" />
            <DetailRow icon="map-pin" label="Venue" value="Eko Hotel, VI" />
            <DetailRow icon="user-check" label="Dress code" value="Black tie" />
            <DetailRow icon="users" label="Slots left" value="2 of 6" valueColor="accentGoldStrong" />
          </Box>

          {/* requirements */}
          <Box style={{ gap: 8 }}>
            <Text variant="headingS">Requirements</Text>
            {REQUIREMENTS.map((r) => (
              <Box key={r} flexDirection="row" alignItems="flex-start" style={{ gap: 8 }}>
                <Box style={{ paddingTop: 3 }}>
                  <Icon name="check" size={16} color="brandEmerald" />
                </Box>
                <Text variant="body" color="inkDefault" style={{ flex: 1 }}>
                  {r}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Screen>

      {/* action bar */}
      <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Box>
          <Button label="Save" variant="secondary" fullWidth={false} onPress={() => router.back()} />
        </Box>
        <Box flex={1}>
          <Button label="Apply now" onPress={() => router.back()} />
        </Box>
      </Box>
    </Box>
  );
}
