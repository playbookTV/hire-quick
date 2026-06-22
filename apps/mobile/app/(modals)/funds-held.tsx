/**
 * Funds Held — matches Figma `Client / 18 Funds Held` (35:411). Live: reads the
 * booking created by confirm-batch. Escrow HOLD lands via the Paystack webhook,
 * so until the booking flips to CONFIRMED we show a "payment opened, awaiting
 * confirmation" state rather than faking success.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { useBooking } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';

export default function FundsHeld(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { booking: bookingId } = useLocalSearchParams<{ booking: string }>();
  const booking = useBooking(bookingId ?? '');

  const held = booking.data?.status === 'CONFIRMED' || booking.data?.status === 'CHECKED_IN' || booking.data?.status === 'PAID';
  const amount = booking.data?.amount ?? 0;
  const title = held ? 'Funds held safely' : 'Payment opened';
  const body = held
    ? `${money(amount)} is held in escrow. We’ll release it to the usher only after they check in on the day — never before.`
    : 'Finish the payment in the Paystack window. Once your bank confirms it, your funds move into escrow and the booking is confirmed.';

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
            backgroundColor: held ? theme.colors.brandEmerald : theme.colors.accentGoldStrong,
          }}
        >
          <Icon name={held ? 'shield' : 'clock'} size={52} color="inverseInk" />
        </Box>
        <Text variant="h1" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
          {body}
        </Text>
        {held ? (
          <Box
            flexDirection="row"
            alignItems="center"
            backgroundColor="brandEmeraldTintWeak"
            borderRadius="md"
            style={{ gap: 8, padding: 16 }}
          >
            <Icon name="check" size={18} color="brandEmerald" />
            <Text variant="label" style={{ fontSize: 13 }} color="brandEmerald">
              Booking confirmed
            </Text>
          </Box>
        ) : null}
      </Box>

      <Box style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <Button label="View booking" onPress={() => router.dismissAll()} />
        {!held ? (
          <Button label="Refresh status" variant="ghost" onPress={() => booking.refetch()} />
        ) : null}
      </Box>
    </Box>
  );
}
