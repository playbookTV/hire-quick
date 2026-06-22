/**
 * Cancellation — matches Figma `Client / 21 Cancellation` (39:468). Live: reads
 * the booking, computes the refund split from the shared policy matrix
 * (`@hq/shared/policy`), and cancels via `useCancelBooking`. The API only
 * executes full-refund windows; late windows return an explained error.
 */
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelWindow, policyForCancellation } from '@hq/shared';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { IconCircle } from '../../components/IconCircle.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { Button } from '../../components/Button.js';
import { Loading } from '../../components/Loading.js';
import { useBooking, useCancelBooking } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';

const WINDOW_NOTE: Record<string, string> = {
  GT_48H: 'You’re cancelling more than 48 hours out — full refund.',
  BETWEEN_12_48H: 'Cancelling within 48 hours of the event splits the fee with the usher.',
  LT_12H: 'Cancelling within 12 hours forfeits your refund to the usher.',
};

function startDate(eventDate: string, startTime: string): Date {
  const d = new Date(eventDate);
  const [h, m] = startTime.split(':').map(Number);
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export default function Cancellation(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking: bookingId } = useLocalSearchParams<{ booking: string }>();
  const booking = useBooking(bookingId ?? '');
  const cancel = useCancelBooking(bookingId ?? '');

  if (booking.isLoading || !booking.data) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Cancel booking" showBack inset />
        <Loading />
      </Box>
    );
  }

  const b = booking.data;
  const gross = b.amount;
  const ev = b.event;
  const window = ev ? cancelWindow(startDate(ev.eventDate, ev.startTime), new Date()) : 'GT_48H';
  const outcome = policyForCancellation('CLIENT', window);
  const refund = Math.floor((gross * outcome.clientRefundPct) / 100);
  const usherShare = Math.floor((gross * outcome.usherPayoutPct) / 100);

  const onCancel = (): void => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        Alert.alert('Booking cancelled', `${money(refund)} will be refunded.`);
        router.dismissAll();
      },
      onError: (e: unknown) =>
        Alert.alert('Couldn’t cancel', e instanceof Error ? e.message : 'This cancellation needs support to settle.'),
    });
  };

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Cancel booking" showBack inset />
      <Screen scroll>
        <Box alignItems="center" style={{ gap: 16 }}>
          <IconCircle icon="alert-triangle" tone="danger" size={72} iconColor="statusDanger" />
          <Text variant="h1" style={{ textAlign: 'center' }}>
            Cancel this booking?
          </Text>
          <Text variant="bodyLg" color="inkMuted" style={{ textAlign: 'center' }}>
            {ev ? ev.title : 'Review the refund before confirming.'}
          </Text>

          <Box alignSelf="stretch" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="400" style={{ gap: 12 }}>
            <KeyValueRow label="Refund to you" value={`${money(refund)}  (${outcome.clientRefundPct}%)`} tone="success" />
            <KeyValueRow label="Usher compensation" value={money(usherShare)} />
            <KeyValueRow label="Processing fee" value="Non-refundable" tone="muted" />
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">You receive</Text>
              <Text variant="amountM" color="brandEmerald">
                {money(refund)}
              </Text>
            </Box>
          </Box>

          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            {WINDOW_NOTE[window]}
          </Text>
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 12, paddingBottom: insets.bottom }}>
          <Button label={cancel.isPending ? 'Cancelling…' : 'Cancel booking'} variant="danger" onPress={onCancel} disabled={cancel.isPending} />
          <Button label="Keep booking" variant="ghost" onPress={() => router.back()} />
        </Box>
      </Screen>
    </Box>
  );
}
