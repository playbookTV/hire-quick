import { Pressable } from 'react-native';
import { Box, Text, useTheme } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';
import { fonts } from '../theme/fonts.js';
import {
  calendarWeeks,
  summarizeAvailability,
  type AvailabilityDayState,
} from '../lib/ui-state.js';
import { Icon, type IconName } from './Icon.js';
import { Card } from './Card.js';
import { Loading } from './Loading.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
const STATES: Record<
  AvailabilityDayState,
  { bg: keyof Theme['colors']; fg: keyof Theme['colors']; icon: IconName | null; label: string }
> = {
  default: { bg: 'transparent', fg: 'inkStrong', icon: null, label: 'Not set' },
  available: { bg: 'brandAccentSubtle', fg: 'brandAccentText', icon: 'check', label: 'Available' },
  busy: { bg: 'statusWarningTint', fg: 'statusWarning', icon: 'x', label: 'Busy' },
  job: { bg: 'bgInverse', fg: 'inkInverse', icon: 'lock', label: 'Booked' },
};

/** Calendar, legend and totals share one state mapping, so booked days stay consistent. */
export function AvailabilityCalendar({
  year,
  month,
  stateOf,
  onDayPress,
  onMonthChange,
  loading,
  disabled,
  saving,
}: Readonly<{
  year: number;
  month: number;
  stateOf: (day: number) => AvailabilityDayState;
  onDayPress: (day: number) => void;
  onMonthChange: (delta: number) => void;
  loading: boolean;
  disabled: boolean;
  saving: boolean;
}>): React.JSX.Element {
  const theme = useTheme();
  const weeks = calendarWeeks(year, month);
  const counts = summarizeAvailability(
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    stateOf,
  );
  return (
    <Box gap="600">
      <Card variant="borderless" radius="xl" padding="300">
        <Box gap="400">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="200">
            <Pressable
              onPress={() => onMonthChange(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Box
                width={theme.spacing['1100']}
                height={theme.spacing['1100']}
                backgroundColor="bgCanvas"
                borderRadius="pill"
                alignItems="center"
                justifyContent="center"
              >
                <Icon name="chevron-left" size={20} />
              </Box>
            </Pressable>
            <Text
              variant="sectionTitle"
              accessibilityRole="header"
              textAlign="center"
              flexShrink={1}
            >
              {MONTHS[month]} {year}
            </Text>
            <Pressable
              onPress={() => onMonthChange(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Box
                width={theme.spacing['1100']}
                height={theme.spacing['1100']}
                backgroundColor="bgCanvas"
                borderRadius="pill"
                alignItems="center"
                justifyContent="center"
              >
                <Icon name="chevron-right" size={20} />
              </Box>
            </Pressable>
          </Box>
          <Box flexDirection="row" gap="100">
            {WEEKDAYS.map((day) => (
              <Text key={day} variant="caption" textAlign="center" flex={1}>
                {day}
              </Text>
            ))}
          </Box>
          {loading ? (
            <Loading />
          ) : (
            <Box gap="100">
              {weeks.map((week, row) => (
                <Box key={row} flexDirection="row" gap="100">
                  {week.map((day, column) => {
                    if (day === null)
                      return (
                        <Box key={`blank-${column}`} flex={1} minHeight={theme.spacing['1200']} />
                      );
                    const state = stateOf(day);
                    const meta = STATES[state];
                    return (
                      <Pressable
                        key={day}
                        onPress={() => onDayPress(day)}
                        disabled={disabled || saving}
                        accessibilityRole="button"
                        accessibilityLabel={`${day} ${MONTHS[month]} ${year}, ${meta.label}. ${state === 'job' ? 'View booking.' : 'Tap to toggle.'}`}
                        accessibilityState={{ disabled: disabled || saving, busy: saving }}
                        style={{ flex: 1 }}
                      >
                        <Box
                          minHeight={theme.spacing['1200']}
                          alignItems="center"
                          justifyContent="center"
                          borderRadius="sm"
                          backgroundColor={meta.bg}
                          gap="50"
                        >
                          <Text
                            variant="label"
                            color={meta.fg}
                            style={{
                              fontSize: 15,
                              lineHeight: 20,
                              fontFamily: state === 'default' ? fonts.sansMedium : fonts.sansBold,
                            }}
                          >
                            {day}
                          </Text>
                          {meta.icon ? (
                            <Icon name={meta.icon} size={theme.spacing['300']} color={meta.fg} />
                          ) : (
                            <Box height={theme.spacing['300']} />
                          )}
                        </Box>
                      </Pressable>
                    );
                  })}
                </Box>
              ))}
            </Box>
          )}
          <Box
            flexDirection="row"
            flexWrap="wrap"
            justifyContent="space-between"
            gap="200"
            paddingTop="300"
            borderTopWidth={1}
            borderTopColor="borderDefault"
          >
            {(['available', 'busy', 'job'] as const).map((state) => {
              const meta = STATES[state];
              return (
                <Box key={state} flexDirection="row" alignItems="center" gap="150">
                  <Box
                    width={theme.spacing['600']}
                    height={theme.spacing['600']}
                    borderRadius="xs"
                    backgroundColor={meta.bg}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Icon name={meta.icon!} size={theme.spacing['300']} color={meta.fg} />
                  </Box>
                  <Text variant="caption">{meta.label}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Card>
      {!loading && !disabled ? (
        <Box gap="300" paddingHorizontal="200" accessibilityLiveRegion="polite">
          <Text variant="label">This month</Text>
          <Box flexDirection="row" gap="300">
            {(['available', 'busy', 'job'] as const).map((state) => (
              <Box key={state} flex={1} gap="100">
                <Text variant="calendarMetric">{counts[state]}</Text>
                <Text variant="caption">{STATES[state].label} days</Text>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
