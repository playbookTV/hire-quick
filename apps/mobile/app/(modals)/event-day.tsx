/**
 * Event Day — matches Figma `Client / 19 Event Day` (37:426). Live: the event's
 * bookings (`useBookings` filtered to this event). The client generates a 6-digit
 * check-in code per usher (`useGenerateCheckin`) for them to enter on arrival,
 * then releases each payout once checked in (`useCompleteBooking`). The big card
 * shows the most recently generated code (dev returns it inline).
 */
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { StatusPill } from '../../components/StatusPill.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Loading } from '../../components/Loading.js';
import { shadowMd, shadowSm } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';
import { fonts } from '../../theme/fonts.js';
import { useEvent, useBookings, useGenerateCheckin, useCompleteBooking } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.js';
import type { Booking } from '../../lib/types.js';

interface CheckinCode {
  code: string;
  expiresAt: string;
  bookingId: string;
  name: string;
}

function RosterRow({
  booking,
  onCode,
  onRate,
  onCancel,
}: {
  booking: Booking;
  onCode: (code: CheckinCode) => void;
  onRate: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const generate = useGenerateCheckin(booking.id);
  const complete = useCompleteBooking(booking.id);
  const toast = useToast();
  const checkedIn = booking.status === 'CHECKED_IN';
  const paid = booking.status === 'PAID';
  const name = booking.usher?.displayName ?? booking.usher?.user.phone ?? 'Usher';
  // REL-H1: Replace native Alert.alert with a designed inline confirmation.
  // Alert couldn’t be disabled while isPending, making double-tap possible;
  // this state also uses the danger variant so the action’s weight is clear.
  const [confirming, setConfirming] = useState(false);

  const gen = (): void => {
    generate.mutate(undefined, {
      onSuccess: (res) => onCode({ ...res, bookingId: booking.id, name }),
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Try again.', 'Couldn’t generate'),
    });
  };
  const release = (): void => {
    setConfirming(false);
    complete.mutate(undefined, {
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Try again.', 'Couldn’t release'),
    });
  };

  // In-app confirmation card replaces the native Alert.
  if (confirming) {
    return (
      <Box
        backgroundColor="statusDangerTint"
        borderWidth={1}
        borderColor="statusDanger"
        borderRadius="lg"
        padding="300"
        style={{ gap: 10 }}
      >
        <Text variant="label" color="statusDanger" numberOfLines={2}>
          Release {name}’s payment? This can’t be undone.
        </Text>
        <Box flexDirection="row" style={{ gap: 8 }}>
          <Box flex={1}>
            <Button
              label={complete.isPending ? 'Releasing…' : 'Release'}
              variant="danger"
              size="md"
              onPress={release}
              loading={complete.isPending}
              disabled={complete.isPending}
            />
          </Box>
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            fullWidth={false}
            onPress={() => setConfirming(false)}
            disabled={complete.isPending}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="lg"
      padding="300"
      style={[{ gap: 12 }, shadowSm]}
    >
      <Avatar name={name} size={40} />
      <Box flex={1} style={{ gap: 2 }}>
        <Text variant="labelLg" color="inkStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="bodySm" color="inkMuted">
          {booking.status.replaceAll('_', ' ').toLowerCase()}
        </Text>
      </Box>
      {paid ? (
        <Button
          label="Rate"
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={() => onRate(booking.id)}
        />
      ) : checkedIn ? (
        <Button
          label={complete.isPending ? 'Releasing…' : 'Release'}
          size="md"
          fullWidth={false}
          onPress={() => setConfirming(true)}
          disabled={complete.isPending}
        />
      ) : booking.status === 'CONFIRMED' ? (
        <Box flexDirection="row" style={{ gap: 8 }}>
          <Button
            label={generate.isPending ? '…' : 'Code'}
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={gen}
            disabled={generate.isPending}
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            fullWidth={false}
            onPress={() => onCancel(booking.id)}
          />
        </Box>
      ) : null}
    </Box>
  );
}

export default function EventDay(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = id ?? '';
  const event = useEvent(eventId);
  const bookings = useBookings();
  const [lastCode, setLastCode] = useState<CheckinCode | null>(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const codeActive =
    lastCode &&
    Date.parse(lastCode.expiresAt) > now &&
    !bookings.data?.some((b) => b.id === lastCode.bookingId && b.status !== 'CONFIRMED');

  // The roster is the live check-in board; poll it while this screen is open so an
  // usher who just checked in appears without a manual refresh (keeps "Live" honest).
  // refetch is stable across renders, so the interval isn't torn down each render.
  const refetchBookings = bookings.refetch;
  useEffect(() => {
    const t = setInterval(() => void refetchBookings(), 15_000);
    return () => clearInterval(t);
  }, [refetchBookings]);

  const roster = (bookings.data ?? []).filter((b) => b.eventId === eventId);
  const checkedIn = roster.filter((b) => b.status === 'CHECKED_IN' || b.status === 'PAID').length;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Event day" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="h2" numberOfLines={1}>
              {event.data?.title ?? 'Event day'}
            </Text>
            <StatusPill status="IN_PROGRESS" />
          </Box>

          {/* check-in code card */}
          <Box
            alignItems="center"
            borderRadius="lg"
            style={[{ backgroundColor: theme.colors.brandSurface, padding: 24, gap: 8 }, shadowMd]}
          >
            <Box
              style={{
                backgroundColor: theme.colors.brandEmeraldStrong,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: theme.borderRadii.xs,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sansBold,
                  fontSize: 11,
                  lineHeight: 14,
                  letterSpacing: 1.2,
                  color: theme.colors.onBrandAccent,
                }}
              >
                CHECK-IN CODE
              </Text>
            </Box>
            <Text
              style={{
                fontFamily: fonts.sansBold,
                fontSize: 44,
                letterSpacing: 4,
                color: primitives.neutral[50],
              }}
            >
              {codeActive ? lastCode.code : '— — —'}
            </Text>
            <Text
              style={{
                fontFamily: fonts.sansRegular,
                fontSize: 13,
                lineHeight: 18,
                color: primitives.emerald[100],
                textAlign: 'center',
              }}
            >
              {codeActive
                ? `${lastCode.name} · expires in ${Math.ceil((Date.parse(lastCode.expiresAt) - now) / 60000)} min. Share only with this usher on arrival.`
                : lastCode
                  ? 'This code is no longer active. Generate a new code if needed.'
                  : 'Tap “Code” beside an usher to generate their code'}
            </Text>
          </Box>

          {/* count */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="headingS">
              {bookings.data ? `${checkedIn} of ${roster.length} checked in` : 'Attendance'}
            </Text>
            <Text
              variant="label"
              style={{ fontSize: 13 }}
              color={bookings.isError ? 'statusDanger' : 'inkMuted'}
            >
              {bookings.isError
                ? 'Refresh failed'
                : bookings.isFetching
                  ? 'Updating…'
                  : bookings.dataUpdatedAt
                    ? `Updated ${new Date(bookings.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not loaded'}
            </Text>
          </Box>

          {/* roster */}
          {bookings.isLoading ? (
            <Loading />
          ) : bookings.isError ? (
            <EmptyState
              icon="alert-circle"
              title="Couldn’t refresh attendance"
              subtitle="Retry before generating codes or releasing payments."
              actionLabel="Refresh roster"
              onAction={() => {
                void bookings.refetch();
              }}
            />
          ) : roster.length === 0 ? (
            <Text variant="bodySm" color="inkMuted">
              No confirmed staff for this event yet.
            </Text>
          ) : (
            <Box style={{ gap: 8 }}>
              {roster.map((b) => (
                <RosterRow
                  key={b.id}
                  booking={b}
                  onCode={setLastCode}
                  onRate={(bid) =>
                    router.push({
                      pathname: '/(modals)/rate-staff',
                      params: { booking: bid, name: 'your usher' },
                    })
                  }
                  onCancel={(bid) =>
                    router.push({ pathname: '/(modals)/cancellation', params: { booking: bid } })
                  }
                />
              ))}
            </Box>
          )}
        </Box>

        <Box style={{ flex: 1, minHeight: 20 }} />
        <Box style={{ gap: 8 }}>
          <Button label="Done" variant="secondary" onPress={() => router.back()} />
          <Text variant="bodySm" color="inkFaint" style={{ textAlign: 'center' }}>
            Auto-completes 60 min after the event ends
          </Text>
        </Box>
      </Screen>
    </Box>
  );
}
