/**
 * Create Event – Success — matches Figma `09 Create Event – Success` (25:199):
 * centered emerald check disc, Heading/L, body, an ETA pill, then "View event" +
 * "Back to home".
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';

export default function EventSuccess(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box flex={1} alignItems="center" justifyContent="center" paddingHorizontal="700" style={{ gap: 20 }}>
        <Box
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandEmerald,
          }}
        >
          <Icon name="check" size={48} color="inverseInk" />
        </Box>
        <Text variant="h1" style={{ textAlign: 'center' }}>
          Event published
        </Text>
        <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
          We’re notifying matching ushers in Lagos now — you’ll start seeing applications shortly.
        </Text>
        <Box
          backgroundColor="brandEmeraldTintWeak"
          borderRadius="pill"
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald">
            ⌁ First application usually in ~12 min
          </Text>
        </Box>
      </Box>

      <Box style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <Button
          label="View event"
          onPress={() => {
            router.dismissAll();
            if (id) router.push(`/(client)/events/${id}`);
          }}
        />
        <Button label="Back to home" variant="ghost" onPress={() => router.dismissAll()} />
      </Box>
    </Box>
  );
}
