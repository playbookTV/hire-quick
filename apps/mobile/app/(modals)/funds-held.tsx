/**
 * Funds Held — matches Figma `Client / 18 Funds Held` (35:411): a 104px emerald
 * shield disc, Heading/L, escrow explainer, a confirmation pill, then "View
 * booking" + "Message your staff". Static preview until the flow is wired.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';

export default function FundsHeld(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box flex={1} alignItems="center" justifyContent="center" paddingHorizontal="700" style={{ gap: 20 }}>
        <Box
          style={{
            width: 104,
            height: 104,
            borderRadius: 52,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandEmerald,
          }}
        >
          <Icon name="shield" size={52} color="inverseInk" />
        </Box>
        <Text variant="h1" style={{ textAlign: 'center' }}>
          Funds held safely
        </Text>
        <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
          ₦30,000 is held in escrow. We’ll release it to each usher only after they check in on the day — never before.
        </Text>
        <Box
          flexDirection="row"
          alignItems="center"
          backgroundColor="brandEmeraldTintWeak"
          borderRadius="md"
          style={{ gap: 8, padding: 16 }}
        >
          <Icon name="check" size={18} color="brandEmerald" />
          <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald">
            2 ushers confirmed · Adeola’s Wedding
          </Text>
        </Box>
      </Box>

      <Box style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <Button label="View booking" onPress={() => router.dismissAll()} />
        <Button label="Message your staff" variant="ghost" onPress={() => router.dismissAll()} />
      </Box>
    </Box>
  );
}
