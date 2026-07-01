/**
 * Funds Held — matches Figma `Client / 18 Funds Held` (35:411). Live: reads the
 * booking created by confirm-batch. Escrow HOLD lands via the Paystack webhook,
 * so until the booking flips to CONFIRMED we show a "payment opened, awaiting
 * confirmation" state rather than faking success.
 */
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { useBooking } from '../../lib/hooks.js';
import { hapticSuccess } from '../../lib/haptics.js';
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
    ? `${money(amount)} is held safely. We’ll release it to the usher only after they check in on the day — never before.`
    : 'If you finished paying, this updates on its own the moment your bank confirms — usually a few seconds. If you closed Paystack without paying, you can leave and start the payment again from your event.';

  // Celebrate the moment the booking flips to held (after the bank confirms).
  useEffect(() => {
    if (held) hapticSuccess();
  }, [held]);

  // The HOLD lands asynchronously via the Paystack webhook, so poll the booking
  // while it's still pending — a completed payment then confirms without the user
  // tapping "Refresh", and a cancelled one simply stays pending (C9). refetch is
  // stable across renders, so the interval isn't reset each render.
  const refetchBooking = booking.refetch;
  useEffect(() => {
    if (held) return;
    const t = setInterval(() => void refetchBooking(), 5000);
    return () => clearInterval(t);
  }, [held, refetchBooking]);

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box flex={1} alignItems="center" justifyContent="center" paddingHorizontal="700" style={{ gap: 20 }}>
        <Animated.View
          key={held ? 'held' : 'pending'}
          entering={ZoomIn.springify().damping(14).stiffness(160)}
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
        </Animated.View>
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
        {held ? (
          <Button label="View booking" onPress={() => router.dismissAll()} />
        ) : (
          <>
            <Button label="Done" onPress={() => router.dismissAll()} />
            <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
              Checking for confirmation automatically…
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}
