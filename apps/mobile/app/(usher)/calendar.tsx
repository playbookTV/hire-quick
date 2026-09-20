/**
 * Availability — matches Figma `Usher / 06 Calendar` (50:169): a month grid the
 * usher taps to mark free days. Live: availability from `useAvailability`
 * (AVAILABLE → emerald, UNAVAILABLE → gold) and days with a booking from
 * `useBookings` (solid emerald, locked). Tapping toggles via `useSetAvailability`.
 *
 * Critique P1 fixes: month navigation works (starts on the current month), day
 * state is conveyed by an icon as well as colour (not colour alone), every cell
 * has a screen-reader label, and loading/error are handled instead of rendering
 * a stale grid.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { calendarWeeks } from '../../lib/ui-state.js';
import { Screen } from '../../components/Screen.js';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { Loading } from '../../components/Loading.js';
import { useAvailability, useSetAvailability, useBookings } from '../../lib/hooks.js';
import type { Theme } from '../../theme/theme.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const pad = (n: number): string => String(n).padStart(2, '0');

type DayState = 'default' | 'available' | 'busy' | 'job';

const STATE_META: Record<DayState, { icon: IconName | null; label: string }> = {
  default: { icon: null, label: 'free, not set' },
  available: { icon: 'check', label: 'available' },
  busy: { icon: 'x', label: 'busy' },
  job: { icon: 'lock', label: 'has a job (locked)' },
};

function cellColors(
  s: DayState,
  colors: Theme['colors'],
): { bg: string; fg: keyof Theme['colors'] } {
  switch (s) {
    case 'job':
      return { bg: colors.brandSurface, fg: 'inverseInk' };
    case 'busy':
      return { bg: colors.accentGoldTint, fg: 'accentGoldStrong' };
    case 'available':
      return { bg: colors.brandEmeraldTint, fg: 'brandEmerald' };
    default:
      return { bg: colors.transparent, fg: 'inkDefault' };
  }
}

function LegendItem({
  color,
  icon,
  label,
}: Readonly<{ color: string; icon: IconName; label: string }>) {
  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
      <Box
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={10} color="inkStrong" />
      </Box>
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
    </Box>
  );
}

export default function Calendar(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
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

  const weeks = calendarWeeks(year, month);

  const stateOf = (day: number): DayState => {
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
        <Box style={{ gap: 16 }}>
          <Box style={{ gap: 4 }}>
            <Text variant="h2">Availability</Text>
            <Text variant="bodySm" color="inkMuted">
              Tap the days you’re free to work
            </Text>
          </Box>

          {/* month nav */}
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Pressable
              onPress={() => shift(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={6}
            >
              <Box
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1.5,
                  borderColor: theme.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="chevron-left" size={20} color="inkStrong" />
              </Box>
            </Pressable>
            <Text variant="headingS" accessibilityRole="header">
              {MONTHS[month]} {year}
            </Text>
            <Pressable
              onPress={() => shift(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={6}
            >
              <Box
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 1.5,
                  borderColor: theme.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="chevron-right" size={20} color="inkStrong" />
              </Box>
            </Pressable>
          </Box>

          {setAvailability.isError ? (
            <Text variant="bodySm" color="statusDanger" accessibilityRole="alert">
              Couldn’t save that day. Your previous availability is unchanged. Tap the day to try
              again.
            </Text>
          ) : null}
          {errored ? (
            <Box
              flexDirection="row"
              alignItems="center"
              backgroundColor="statusDangerTint"
              borderRadius="md"
              padding="300"
              style={{ gap: 8 }}
            >
              <Icon name="wifi-off" size={16} color="statusDanger" />
              <Text variant="bodySm" color="statusDanger" style={{ flex: 1 }}>
                Couldn’t load your calendar.
              </Text>
              <Pressable
                onPress={() => {
                  void availability.refetch();
                  void bookings.refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text variant="label" color="statusDanger">
                  Retry
                </Text>
              </Pressable>
            </Box>
          ) : null}

          <Box flexDirection="row" style={{ marginHorizontal: -14 }}>
            {WEEKDAYS.map((d, i) => (
              <Box key={`${d}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="overline" color="inkFaint" style={{ letterSpacing: 0.13 }}>
                  {d}
                </Text>
              </Box>
            ))}
          </Box>

          {loading ? (
            <Box style={{ paddingTop: 24 }}>
              <Loading />
            </Box>
          ) : (
            <Box style={{ marginHorizontal: -14, gap: 4 }}>
              {weeks.map((week, row) => (
                <Box key={row} flexDirection="row">
                  {week.map((day, i) => {
                    if (day === null)
                      return <Box key={`b-${i}`} style={{ flex: 1, minHeight: 48 }} />;
                    const s = stateOf(day);
                    const meta = STATE_META[s];
                    const { bg, fg } = cellColors(s, theme.colors);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => toggle(day)}
                        disabled={errored || setAvailability.isPending}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: errored || setAvailability.isPending,
                          busy: setAvailability.isPending,
                        }}
                        accessibilityLabel={`${day} ${MONTHS[month]}, ${meta.label}${s === 'job' ? '. View booking.' : '. Tap to toggle.'}`}
                        style={{
                          flex: 1,
                          minHeight: 48,
                          borderRadius: theme.borderRadii.md,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: bg,
                          gap: 1,
                        }}
                      >
                        <Text variant="label" style={{ fontSize: 15 }} color={fg}>
                          {day}
                        </Text>
                        {meta.icon ? (
                          <Icon name={meta.icon} size={9} color={fg} />
                        ) : (
                          <Box style={{ height: 9 }} />
                        )}
                      </Pressable>
                    );
                  })}
                </Box>
              ))}
            </Box>
          )}

          <Box flexDirection="row" alignItems="center" flexWrap="wrap" style={{ gap: 16 }}>
            <LegendItem color={theme.colors.brandEmeraldTint} icon="check" label="Available" />
            <LegendItem color={theme.colors.accentGoldTint} icon="x" label="Busy" />
            <LegendItem color={theme.colors.brandEmerald} icon="lock" label="Has job" />
          </Box>
        </Box>
      </Screen>
    </Box>
  );
}
