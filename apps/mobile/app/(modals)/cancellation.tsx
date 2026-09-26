import { useAuth } from '../../lib/auth-context.js';
/**
 * Cancellation — matches Figma `Client / 21 Cancellation` (39:468). Live: reads
 * the booking, computes the refund split from the shared policy matrix
 * (`@hq/shared/policy`), and cancels via `useCancelBooking`. The API only
 * settles the approved split or retains the request for two-admin approval.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../lib/api-error.js';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { IconCircle } from '../../components/IconCircle.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { Button } from '../../components/Button.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Loading } from '../../components/Loading.js';
import { useBooking, useCancelBooking, useCancellationQuote } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import { openSupport } from '../../lib/support.js';
import { Banner } from '../../components/Banner.js';
import { money } from '../../lib/format.js';

const WINDOW_NOTE: Record<string, string> = {
  GT_48H: 'You’re cancelling more than 48 hours out — full refund.',
  BETWEEN_12_48H:
    'You receive a 50% refund. The remaining amount covers usher compensation and the platform fee.',
  LT_12H:
    'No client refund is due. The booking amount covers usher compensation and the platform fee.',
};

export default function Cancellation(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { booking: bookingId } = useLocalSearchParams<{ booking: string }>();
  const booking = useBooking(bookingId ?? '');
  const quote = useCancellationQuote(bookingId ?? '');
  const { user } = useAuth();
  const cancel = useCancelBooking(bookingId ?? '');
  const toast = useToast();

  if (booking.isLoading || quote.isLoading) {
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Cancel booking" showBack inset />
        <Loading />
      </Box>
    );
  }

  if (booking.isError || !booking.data || quote.isError || !quote.data)
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Cancel booking" showBack inset />
        <EmptyState
          icon="alert-circle"
          title="Couldn’t load this booking"
          subtitle="Retry to see your refund before cancelling."
          actionLabel="Try again"
          onAction={() => {
            void booking.refetch();
            void quote.refetch();
          }}
        />
      </Box>
    );
  if (!quote.data.eligible)
    return (
      <Box flex={1} backgroundColor="bgCanvas">
        <AppBar title="Cancellation status" showBack inset />
        <Screen scroll>
          <Text variant="body">
            This booking is no longer available for a new cancellation. View its current status and
            any refund updates.
          </Text>
          <Button
            label="View booking"
            onPress={() =>
              router.replace({
                pathname: '/(modals)/booking-details',
                params: { booking: bookingId },
              })
            }
          />
        </Screen>
      </Box>
    );
  const b = booking.data;
  const ev = b.event;
  const window = quote.data.window;
  const outcome = quote.data;
  const refund = quote.data.refundKobo;
  const usherShare = quote.data.usherCompensationKobo;
  const selfServe = quote.data.selfServe;
  const supportMessage = `Hi HireQuick support — I need to cancel my booking for "${ev?.title ?? 'my event'}" but it's inside the late-cancellation window. Booking ID: ${bookingId ?? ''}.`;

  const onCancel = (): void => {
    cancel.mutate(
      { expectedWindow: quote.data.window, expectedRefundKobo: refund },
      {
        onSuccess: (result) => {
          const actualRefund = result.settlement?.refundKobo ?? refund;
          if (result.status === 'AWAITING_APPROVAL')
            toast.info(
              'Your cancellation is reserved at these amounts and awaits two-admin approval. Funds remain held.',
            );
          else if (result.status === 'PROCESSING')
            toast.info(
              'Your cancellation is processing. Funds remain held until the refund is confirmed.',
            );
          else if (result.status === 'FAILED')
            toast.error('The refund failed. Contact support to review this cancellation.');
          else
            toast.success(
              actualRefund > 0
                ? `A ${money(actualRefund)} refund has been recorded. Bank processing times can vary.`
                : 'No client refund is due. Usher compensation has been credited.',
              'Cancellation recorded',
            );
          router.replace({ pathname: '/(modals)/booking-details', params: { booking: b.id } });
        },
        onError: (e: unknown) => {
          if (e instanceof ApiError && e.code === 'REFUND_PENDING') {
            toast.info('Your refund request is processing. Check the booking for updates.');
            router.replace({ pathname: '/(modals)/booking-details', params: { booking: b.id } });
            return;
          }
          toast.error(e instanceof Error ? e.message : 'Please try again.', 'Couldn’t cancel');
          void quote.refetch();
        },
      },
    );
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

          <Box
            alignSelf="stretch"
            backgroundColor="bgSurface"
            borderWidth={1}
            borderColor="borderDefault"
            borderRadius="lg"
            padding="400"
            style={{ gap: 12 }}
          >
            <KeyValueRow
              label={user?.role === 'USHER' ? 'Refund to client' : 'Refund to you'}
              value={`${money(refund)}  (${outcome.clientRefundPct}%)`}
              tone="success"
            />
            <KeyValueRow label="Amount retained" value={money(usherShare)} />
            <KeyValueRow
              label="Platform fee retained"
              value={money(quote.data.platformFeeKobo)}
            />
            <KeyValueRow label="Usher compensation" value={money(quote.data.usherPayoutKobo)} />
            <KeyValueRow
              label="Processing fee deduction"
              value={
                quote.data.processingFeeKobo === 0 ? 'None' : money(quote.data.processingFeeKobo)
              }
              tone="muted"
            />
            <Box style={{ width: 100, height: 1 }} backgroundColor="borderDefault" />
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text variant="titleM">
                {user?.role === 'USHER' ? 'Client receives' : 'You receive'}
              </Text>
              <Text variant="amountM" color="brandEmerald">
                {money(refund)}
              </Text>
            </Box>
          </Box>

          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            {user?.role === 'USHER'
              ? 'Cancelling refunds the client. You will not earn this booking’s payout and your reliability may be affected.'
              : WINDOW_NOTE[window]}
          </Text>

          {quote.data.requiresApproval ? (
            <Banner
              tone="info"
              title="Admin approval required"
              message="Confirming reserves these amounts. Two different admins must approve before settlement; funds remain held while they review."
            />
          ) : null}
          {selfServe ? null : (
            <Banner
              tone="warning"
              title="This cancellation needs support"
              message="Contact support to review this booking’s current cancellation status before making another request."
            />
          )}
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 12, paddingBottom: insets.bottom }}>
          {selfServe ? (
            <Button
              label={
                cancel.isPending
                  ? 'Submitting…'
                  : quote.data.requiresApproval
                    ? 'Request cancellation'
                    : 'Confirm cancellation'
              }
              variant="danger"
              onPress={onCancel}
              disabled={cancel.isPending || !quote.data.eligible}
            />
          ) : (
            <Button
              label="Contact support to cancel"
              variant="primary"
              onPress={() => void openSupport(supportMessage)}
            />
          )}
          <Button label="Keep booking" variant="ghost" onPress={() => router.back()} />
        </Box>
      </Screen>
    </Box>
  );
}
