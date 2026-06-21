/**
 * Invitation — matches Figma `Usher / 04 Invitation` (49:150): an emerald hero,
 * the event summary card, a warning that accepting only reserves the slot (the
 * booking confirms once the client funds escrow), and Decline / Accept actions.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Banner } from '../../components/Banner.js';
import { MetaRow } from '../../components/MetaRow.js';
import { Icon } from '../../components/Icon.js';
import { shadowMd } from '../../theme/shadows.js';

export default function Invitation(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Invitation" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          {/* hero */}
          <Box alignItems="center" borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 20, gap: 12 }, shadowMd]}>
            <Box style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandEmeraldStrong }}>
              <Icon name="mail" size={26} color="inverseInk" />
            </Box>
            <Text variant="h2" color="inverseInk">You’re invited!</Text>
            <Text variant="body" color="brandEmeraldTint" style={{ textAlign: 'center' }}>
              Sarah Johnson invited you to usher at Adeola’s Wedding.
            </Text>
          </Box>

          {/* event */}
          <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">Adeola’s Wedding</Text>
              <Text variant="amountM" color="brandEmerald">₦15,000</Text>
            </Box>
            <MetaRow icon="calendar" text="Sat 12 Jul · 4:00 PM" />
            <MetaRow icon="map-pin" text="Eko Hotel, Victoria Island · Black tie" />
          </Box>

          <Banner tone="warning" message="Accepting reserves your slot. The booking confirms once Sarah pays into escrow." />
        </Box>
      </Screen>

      {/* actions */}
      <Box flexDirection="row" backgroundColor="bgCanvas" style={{ gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1.5, borderTopColor: theme.colors.borderDefault }}>
        <Box flex={1}>
          <Button label="Decline" variant="secondary" onPress={() => router.back()} />
        </Box>
        <Box flex={1}>
          <Button label="Accept" onPress={() => router.back()} />
        </Box>
      </Box>
    </Box>
  );
}
