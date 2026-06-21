/**
 * Event Day — matches Figma `Client / 19 Event Day` (37:426): the big emerald
 * check-in code card, a live check-in count, CheckinRows per usher, and a
 * "Complete & release payouts" CTA. Static preview of the attendance flow.
 */
import { useRouter } from 'expo-router';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { CheckinRow, type CheckinState } from '../../components/CheckinRow.js';
import { StatusPill } from '../../components/StatusPill.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { shadowMd } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';

const ROSTER: { name: string; state: CheckinState; statusText: string }[] = [
  { name: 'Ada Martins', state: 'CheckedIn', statusText: 'Checked in · 4:05 PM' },
  { name: 'Bisi Okoro', state: 'CheckedIn', statusText: 'Checked in · 4:05 PM' },
  { name: 'Chioma Eze', state: 'SelfCheckedIn', statusText: 'Self-checked in · confirm?' },
  { name: 'Dele Smith', state: 'Awaiting', statusText: 'Awaiting arrival' },
];

export default function EventDay(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Event day" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          {/* header */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="h2">Adeola’s Wedding</Text>
            <StatusPill status="IN_PROGRESS" />
          </Box>

          {/* check-in code card */}
          <Box
            alignItems="center"
            borderRadius="lg"
            style={[{ backgroundColor: theme.colors.brandEmerald, padding: 24, gap: 8 }, shadowMd]}
          >
            <Box style={{ backgroundColor: theme.colors.brandEmeraldStrong, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadii.xs }}>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: primitives.gold[500] }}>
                CHECK-IN CODE
              </Text>
            </Box>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 44, letterSpacing: 4, color: '#FBF7F0' }}>482 913</Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: primitives.emerald[100] }}>
              Each usher enters this on arrival
            </Text>
            <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
              <Icon name="grid" size={16} color="inverseInk" />
              <Text variant="label" style={{ fontSize: 13 }} color="inverseInk">
                Show QR instead
              </Text>
            </Box>
          </Box>

          {/* count */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="headingS">4 of 6 checked in</Text>
            <Text variant="label" style={{ fontSize: 13 }} color="statusSuccess">
              Live
            </Text>
          </Box>

          {/* roster */}
          <Box style={{ gap: 8 }}>
            {ROSTER.map((r) => (
              <CheckinRow key={r.name} name={r.name} state={r.state} statusText={r.statusText} />
            ))}
          </Box>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 8 }}>
          <Button label="Complete & release payouts" onPress={() => router.back()} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Auto-completes 60 min after the event ends
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
