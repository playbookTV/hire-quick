import { useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { QueryState } from '../../components/QueryState.js';
import { StatusPill } from '../../components/StatusPill.js';
import { KeyValueRow } from '../../components/KeyValueRow.js';
import { useBooking, useAssertArrival } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth-context.js';
import { useToast } from '../../lib/toast.js';
import { userMessage } from '../../lib/api-error.js';
import { dateTime, money } from '../../lib/format.js';
import { openSupport } from '../../lib/support.js';

const EXPLANATIONS: Record<string, string> = {
  PENDING_PAYMENT: 'Payment has not been confirmed. This is not yet a confirmed job.',
  CONFIRMED:
    'Payment is held securely. Verify attendance with the client’s check-in code on arrival.',
  CHECKED_IN: 'Attendance is verified. Payment remains held until completion.',
  COMPLETED: 'Work is complete. Check here for the payout status.',
  PAID: 'Payment has been released to the usher’s wallet.',
  CANCELLED:
    'This booking is cancelled. Contact support if you need help with the payment outcome.',
  REFUNDED: 'A refund has been recorded. Your bank may take time to show the credit.',
  NO_SHOW: 'A no-show has been recorded for this booking.',
  DISPUTED: 'This booking is under review. Check the case status below.',
};
export default function BookingDetails(): React.JSX.Element {
  const { booking = '' } = useLocalSearchParams<{ booking?: string }>();
  const query = useBooking(booking);
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const arrival = useAssertArrival(booking);
  const { user } = useAuth();
  const usher = user?.role === 'USHER';
  const toast = useToast();
  const router = useRouter();
  const go = (
    pathname:
      | '/(modals)/check-in'
      | '/(modals)/cancellation'
      | '/(modals)/dispute'
      | '/(modals)/rate-staff'
      | '/(modals)/message-thread',
  ) => router.push({ pathname, params: { booking } });
  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Booking details" showBack inset />
      <Screen scroll>
        <QueryState query={query}>
          {(b) => (
            <Box style={{ gap: 20 }}>
              <StatusPill status={b.status} />
              <Text variant="h1">{b.event?.title ?? 'Event booking'}</Text>
              <Text variant="body">
                {EXPLANATIONS[b.status] ?? 'Refresh to see the latest booking status.'}
              </Text>
              <Card>
                <KeyValueRow
                  label={usher ? 'Client' : 'Usher'}
                  value={(usher ? b.event?.client?.displayName : b.usher?.displayName) ?? '—'}
                />
                {b.event ? (
                  <>
                    <KeyValueRow
                      label="When"
                      value={dateTime(b.event.eventDate, b.event.startTime)}
                    />
                    <KeyValueRow label="Venue" value={b.event.venue || 'Available after payment'} />
                  </>
                ) : null}
                <KeyValueRow label="Booking total" value={money(b.amount)} />
                {usher && b.payment ? (
                  <KeyValueRow label="Net earnings" value={money(b.payment.usherPayout)} />
                ) : null}
                {b.payment ? (
                  <KeyValueRow
                    label="Payment status"
                    value={b.payment.escrowStatus.toLowerCase().replaceAll('_', ' ')}
                  />
                ) : null}
              </Card>
              {b.refund ? (
                <Card>
                  <Box style={{ gap: 8 }}>
                    <Text variant="titleM">
                      Refund{' '}
                      {b.refund.status === 'RECORDED'
                        ? 'recorded'
                        : b.refund.status === 'FAILED'
                          ? 'needs attention'
                          : 'processing'}
                    </Text>
                    <Text variant="bodySm">
                      {b.refund.status === 'RECORDED'
                        ? 'The refund has been recorded. Bank processing times can vary.'
                        : 'Check the latest status before making another request.'}
                    </Text>
                    <Text variant="bodySm" selectable>
                      Reference: {b.refund.providerRef ?? b.refund.id}
                    </Text>
                    <Button
                      label="Check refund status"
                      variant="secondary"
                      disabled={query.isFetching}
                      onPress={() => {
                        void query.refetch();
                      }}
                    />
                  </Box>
                </Card>
              ) : null}
              {b.arrivalAssertedAt ? (
                <Text variant="bodySm" color="inkMuted">
                  Arrival reported {new Date(b.arrivalAssertedAt).toLocaleString()}.{' '}
                  {b.checkedInAt
                    ? 'Attendance verified.'
                    : 'This report does not verify attendance.'}
                </Text>
              ) : null}
              {b.status === 'PENDING_PAYMENT' && !usher ? (
                <Button
                  label="Resume event checkout"
                  onPress={() =>
                    router.push({
                      pathname: '/(modals)/payment-summary',
                      params: { id: b.eventId },
                    })
                  }
                />
              ) : null}
              {b.status === 'CONFIRMED' ? (
                <>
                  <Button
                    label={usher ? 'Enter check-in code' : 'Show check-in code'}
                    onPress={() =>
                      usher
                        ? go('/(modals)/check-in')
                        : router.push({
                            pathname: '/(modals)/event-day',
                            params: { id: b.eventId },
                          })
                    }
                  />
                  {usher && !b.arrivalAssertedAt ? (
                    <Button
                      label={arrival.isPending ? 'Recording arrival…' : 'I have arrived'}
                      variant="secondary"
                      disabled={arrival.isPending}
                      onPress={() =>
                        arrival.mutate(undefined, {
                          onError: (e) => toast.error(userMessage(e)),
                          onSuccess: () =>
                            toast.success(
                              'Arrival reported. Ask the client for your check-in code.',
                            ),
                        })
                      }
                    />
                  ) : null}
                  <Button
                    label="Cancel booking"
                    variant="secondary"
                    onPress={() => go('/(modals)/cancellation')}
                  />
                </>
              ) : null}
              {b.status === 'CHECKED_IN' && !usher ? (
                <Button
                  label="Confirm work & release payment"
                  onPress={() =>
                    router.push({ pathname: '/(modals)/event-day', params: { id: b.eventId } })
                  }
                />
              ) : null}
              {b.status !== 'PENDING_PAYMENT' ? (
                <Button
                  label={
                    ['CANCELLED', 'REFUNDED', 'NO_SHOW'].includes(b.status)
                      ? 'View message history'
                      : 'Message'
                  }
                  variant="secondary"
                  onPress={() => go('/(modals)/message-thread')}
                />
              ) : null}
              {['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.status) &&
              (!usher || b.checkedInAt) ? (
                <Button
                  label="Report a problem"
                  variant="secondary"
                  onPress={() => go('/(modals)/dispute')}
                />
              ) : null}
              {(b.disputes ?? []).map((d) => (
                <Card key={d.id}>
                  <Box style={{ gap: 8 }}>
                    <Text variant="titleM">{d.reason}</Text>
                    {d.note ? <Text variant="body">{d.note}</Text> : null}
                    <Text variant="bodySm">
                      Case status · {d.status.toLowerCase().replaceAll('_', ' ')}
                    </Text>
                    {d.resolution ? <Text variant="body">{d.resolution}</Text> : null}
                    <Button
                      label={
                        d.status === 'OPEN' || d.status === 'UNDER_REVIEW'
                          ? 'Discuss case & share evidence'
                          : 'View case conversation'
                      }
                      variant="secondary"
                      onPress={() => go('/(modals)/message-thread')}
                    />
                    <Text variant="bodySm" color="inkMuted">
                      Messages and photos shared in this booking’s conversation are visible to both
                      participants and available for case review.
                    </Text>
                    <Text variant="bodySm" color="inkMuted">
                      Case reference: {d.id}
                    </Text>
                  </Box>
                </Card>
              ))}
              {b.status === 'PAID' ? (
                b.myReview ? (
                  <Card>
                    <Text variant="titleM">Your review · {b.myReview.rating}/5</Text>
                    <Text variant="body">
                      {b.myReview.comment || 'Thank you for sharing your feedback.'}
                    </Text>
                  </Card>
                ) : (
                  <Button
                    label={usher ? 'Review client' : 'Review usher'}
                    onPress={() => go('/(modals)/rate-staff')}
                  />
                )
              ) : null}
              <Button
                label="Contact support about this booking"
                variant="ghost"
                onPress={() => {
                  void openSupport(`Hi HireQuick support, I need help with booking ${b.id}.`);
                }}
              />
              <Text variant="bodySm" color="inkMuted" selectable>
                Booking reference: {b.id}
              </Text>
            </Box>
          )}
        </QueryState>
      </Screen>
    </Box>
  );
}
