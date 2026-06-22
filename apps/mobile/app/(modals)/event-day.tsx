/**
 * Event Day — matches Figma `Client / 19 Event Day` (37:426). Live: the event's
 * bookings (`useBookings` filtered to this event). The client generates a 6-digit
 * check-in code per usher (`useGenerateCheckin`) for them to enter on arrival,
 * then releases each payout once checked in (`useCompleteBooking`). The big card
 * shows the most recently generated code (dev returns it inline).
 */
import { useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { AppBar } from '../../components/AppBar.js';
import { StatusPill } from '../../components/StatusPill.js';
import { Avatar } from '../../components/Avatar.js';
import { Button } from '../../components/Button.js';
import { Loading } from '../../components/Loading.js';
import { shadowMd, shadowSm } from '../../theme/shadows.js';
import { primitives } from '../../theme/primitives.js';
import { useEvent, useBookings, useGenerateCheckin, useCompleteBooking } from '../../lib/hooks.js';
import type { Booking } from '../../lib/types.js';

function RosterRow({ booking, onCode, onRate }: { booking: Booking; onCode: (code: string) => void; onRate: (id: string) => void }) {
  const generate = useGenerateCheckin(booking.id);
  const complete = useCompleteBooking(booking.id);
  const checkedIn = booking.status === 'CHECKED_IN';
  const paid = booking.status === 'PAID';
  const name = booking.usher?.displayName ?? booking.usher?.user.phone ?? 'Usher';

  const gen = (): void => {
    generate.mutate(undefined, {
      onSuccess: (res) => {
        if (res.devCode) onCode(res.devCode);
        Alert.alert('Check-in code', res.devCode ? `Give this to the usher: ${res.devCode}` : 'Code sent.');
      },
      onError: (e: unknown) => Alert.alert('Couldn’t generate', e instanceof Error ? e.message : 'Try again.'),
    });
  };
  const done = (): void => {
    complete.mutate(undefined, {
      onError: (e: unknown) => Alert.alert('Couldn’t complete', e instanceof Error ? e.message : 'Try again.'),
    });
  };

  return (
    <Box flexDirection="row" alignItems="center" backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg" padding="300" style={[{ gap: 12 }, shadowSm]}>
      <Avatar name={name} size={40} />
      <Box flex={1} style={{ gap: 2 }}>
        <Text variant="label" style={{ fontSize: 15 }} color="inkStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="bodySm" color="inkMuted">
          {booking.status.replace('_', ' ').toLowerCase()}
        </Text>
      </Box>
      {paid ? (
        <Button label="Rate" variant="secondary" size="md" fullWidth={false} onPress={() => onRate(booking.id)} />
      ) : checkedIn ? (
        <Button label={complete.isPending ? '…' : 'Release'} size="md" fullWidth={false} onPress={done} disabled={complete.isPending} />
      ) : (
        <Button label={generate.isPending ? '…' : 'Code'} variant="secondary" size="md" fullWidth={false} onPress={gen} disabled={generate.isPending} />
      )}
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
  const [lastCode, setLastCode] = useState<string | null>(null);

  const roster = (bookings.data ?? []).filter((b) => b.eventId === eventId);
  const checkedIn = roster.filter((b) => b.status === 'CHECKED_IN' || b.status === 'PAID').length;

  return (
    <Box flex={1} backgroundColor="bgCanvas">
      <AppBar title="Event day" showBack inset />
      <Screen scroll>
        <Box style={{ gap: 16 }}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="h2" numberOfLines={1}>{event.data?.title ?? 'Event day'}</Text>
            <StatusPill status="IN_PROGRESS" />
          </Box>

          {/* check-in code card */}
          <Box alignItems="center" borderRadius="lg" style={[{ backgroundColor: theme.colors.brandEmerald, padding: 24, gap: 8 }, shadowMd]}>
            <Box style={{ backgroundColor: theme.colors.brandEmeraldStrong, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadii.xs }}>
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1.2, color: primitives.gold[500] }}>
                CHECK-IN CODE
              </Text>
            </Box>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 44, letterSpacing: 4, color: '#FBF7F0' }}>
              {lastCode ?? '— — —'}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: primitives.emerald[100], textAlign: 'center' }}>
              {lastCode ? 'The usher enters this on arrival' : 'Tap “Code” by a usher to generate their code'}
            </Text>
          </Box>

          {/* count */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Text variant="headingS">{checkedIn} of {roster.length} checked in</Text>
            <Text variant="label" style={{ fontSize: 13 }} color="statusSuccess">
              Live
            </Text>
          </Box>

          {/* roster */}
          {bookings.isLoading ? (
            <Loading />
          ) : roster.length === 0 ? (
            <Text variant="bodySm" color="inkMuted">No confirmed staff for this event yet.</Text>
          ) : (
            <Box style={{ gap: 8 }}>
              {roster.map((b) => (
                <RosterRow
                  key={b.id}
                  booking={b}
                  onCode={setLastCode}
                  onRate={(bid) => router.push({ pathname: '/(modals)/rate-staff', params: { booking: bid, name: 'your usher' } })}
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
