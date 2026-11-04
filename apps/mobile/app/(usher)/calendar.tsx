/** Availability editing and booking navigation, backed by live queries. */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Text } from '../../theme/restyle.js';
import { Screen } from '../../components/Screen.js';
import { EmptyState } from '../../components/EmptyState.js';
import { AvailabilityCalendar } from '../../components/AvailabilityCalendar.js';
import { useAvailability, useSetAvailability, useBookings } from '../../lib/hooks.js';
import type { AvailabilityDayState } from '../../lib/ui-state.js';

const pad = (n: number): string => String(n).padStart(2, '0');

export default function Calendar(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { year, month } = view;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
  const dateOf = (day: number): string => `${year}-${pad(month + 1)}-${pad(day)}`;

  const availability = useAvailability(from, to);
  const setAvailability = useSetAvailability();
  const bookings = useBookings();

  const statusByDay = new Map<number, 'AVAILABLE' | 'UNAVAILABLE'>();
  for (const row of availability.data ?? []) {
    const d = new Date(row.date);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month)
      statusByDay.set(d.getUTCDate(), row.status);
  }
  const jobDays = new Set<number>();
  for (const b of bookings.data ?? []) {
    if (!b.event || !['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID'].includes(b.status)) continue;
    const d = new Date(b.event.eventDate);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) jobDays.add(d.getUTCDate());
  }

  const stateOf = (day: number): AvailabilityDayState => {
    if (jobDays.has(day)) return 'job';
    const s = statusByDay.get(day);
    if (s === 'UNAVAILABLE') return 'busy';
    if (s === 'AVAILABLE') return 'available';
    return 'default';
  };

  const toggle = (day: number): void => {
    if (jobDays.has(day)) {
      const b = (bookings.data ?? []).find(
        (b) =>
          b.event?.eventDate.slice(0, 10) === dateOf(day) &&
          ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAID'].includes(b.status),
      );
      if (b) router.push({ pathname: '/(modals)/booking-details', params: { booking: b.id } });
      return;
    }
    const next = statusByDay.get(day) === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    setAvailability.mutate({ date: dateOf(day), status: next });
  };

  const shift = (delta: number): void => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  const loading = availability.isLoading || bookings.isLoading;
  const errored = availability.isError || bookings.isError;

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Screen scroll>
        <Box gap="400">
          <Box gap="100">
            <Text variant="h2" accessibilityRole="header">
              Availability
            </Text>
            <Text variant="bodySm">Tap the days you’re free to work</Text>
          </Box>
          {setAvailability.isError ? (
            <Text variant="bodySm" color="statusDanger" accessibilityRole="alert">
              Couldn’t save that day. Your previous availability is unchanged. Tap the day to try
              again.
            </Text>
          ) : null}
          {errored ? (
            <EmptyState
              icon="wifi-off"
              title="Couldn’t load your calendar"
              actionLabel="Try again"
              onAction={() => {
                void availability.refetch();
                void bookings.refetch();
              }}
            />
          ) : null}
          <AvailabilityCalendar
            year={year}
            month={month}
            stateOf={stateOf}
            onDayPress={toggle}
            onMonthChange={shift}
            loading={loading}
            disabled={errored}
            saving={setAvailability.isPending}
          />
        </Box>
      </Screen>
    </Box>
  );
}
