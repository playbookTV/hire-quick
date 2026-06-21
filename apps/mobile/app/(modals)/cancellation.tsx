/**
 * Cancellation — matches Figma `Client / 21 Cancellation` (39:468): danger icon,
 * a refund breakdown card (policy-driven), a window note, then a danger "Cancel
 * booking" + ghost "Keep booking". Static preview of the policy matrix.
 */
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { IconCircle } from '../../components/IconCircle.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { Button } from '../../components/Button.js';

export default function Cancellation(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Cancel booking" showBack inset />
      <Screen scroll>
        <Box alignItems="center" style={{ gap: 16 }}>
          <IconCircle icon="alert-triangle" tone="danger" size={72} iconColor="statusDanger" />
          <Text variant="h1" style={{ textAlign: 'center' }}>
            Cancel Ada Martins?
          </Text>
          <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
            Your event is 5 days away.
          </Text>

          <Box alignSelf="stretch" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <KeyValueRow label="Refund to you" value="₦15,000  (100%)" tone="success" />
            <KeyValueRow label="Usher compensation" value="₦0" />
            <KeyValueRow label="Processing fee" value="Non-refundable" tone="muted" />
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">You receive</Text>
              <Text variant="amountM" color="brandEmerald">
                ₦15,000
              </Text>
            </Box>
          </Box>

          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Cancel within 48 hours of the event and your refund drops to 50%.
          </Text>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 12, paddingBottom: insets.bottom }}>
          <Button label="Cancel booking" variant="danger" onPress={() => router.back()} />
          <Button label="Keep booking" variant="ghost" onPress={() => router.back()} />
        </Box>
      </Screen>
    </Box>
  );
}
