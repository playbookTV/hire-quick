/**
 * Availability — matches Figma `Usher / 06 Calendar` (50:169): a month grid the
 * usher taps to mark free days. Days carry one of four states — available
 * (emerald tint), busy (gold tint), has-job (solid emerald), or default — with a
 * legend below. July 2026 is shown statically; tapping toggles availability.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../../theme/restyle.js';
import { Icon } from '../../components/Icon.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FIRST_WEEKDAY = 3; // July 1 2026 is a Wednesday
const DAYS_IN_MONTH = 31;
const BUSY = new Set([9, 15]);
const HAS_JOB = new Set([12]);

type DayState = 'default' | 'available' | 'busy' | 'job';

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
      <Box style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
    </Box>
  );
}

export default function Calendar(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState<Set<number>>(new Set([5, 6, 13, 19, 20, 26, 27]));
  const [focused, setFocused] = useState<number | null>(19);

  const cells: (number | null)[] = [
    ...Array.from({ length: FIRST_WEEKDAY }, () => null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];

  function stateOf(day: number): DayState {
    if (HAS_JOB.has(day)) return 'job';
    if (BUSY.has(day)) return 'busy';
    if (available.has(day)) return 'available';
    return 'default';
  }

  function toggle(day: number) {
    if (HAS_JOB.has(day) || BUSY.has(day)) return; // locked
    setFocused(day);
    setAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <Box flex={1} backgroundColor="bgCanvas" style={{ paddingTop: insets.top }}>
      <Box style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
        {/* header */}
        <Box style={{ gap: 4 }}>
          <Text variant="h2">Availability</Text>
          <Text variant="bodySm" color="inkMuted">
            Tap the days you’re free to work
          </Text>
        </Box>

        {/* month nav */}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-left" size={20} color="inkStrong" />
          </Box>
          <Text variant="headingS">July 2026</Text>
          <Box style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-right" size={20} color="inkStrong" />
          </Box>
        </Box>

        {/* weekday header */}
        <Box flexDirection="row" style={{ gap: 4 }}>
          {WEEKDAYS.map((d, i) => (
            <Box key={`${d}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="overline" color="inkFaint" style={{ letterSpacing: 0.13 }}>
                {d}
              </Text>
            </Box>
          ))}
        </Box>

        {/* day grid */}
        <Box flexDirection="row" flexWrap="wrap" style={{ gap: 4 }}>
          {cells.map((day, i) => {
            if (day === null) return <Box key={`b-${i}`} style={{ width: 40, height: 44 }} />;
            const s = stateOf(day);
            const bg =
              s === 'job' ? theme.colors.brandEmerald : s === 'busy' ? theme.colors.accentGoldTint : s === 'available' ? theme.colors.brandEmeraldTint : 'transparent';
            const fg =
              s === 'job' ? 'inverseInk' : s === 'busy' ? 'accentGoldStrong' : s === 'available' ? 'brandEmerald' : 'inkDefault';
            const border = focused === day && s === 'available';
            return (
              <Pressable key={day} onPress={() => toggle(day)} style={{ width: 40, height: 44, borderRadius: theme.borderRadii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: border ? 2 : 0, borderColor: theme.colors.brandEmerald }}>
                <Text variant="label" style={{ fontSize: 15 }} color={fg as 'inkDefault'}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </Box>

        {/* legend */}
        <Box flexDirection="row" alignItems="center" style={{ gap: 16 }}>
          <LegendDot color={theme.colors.brandEmeraldTint} label="Available" />
          <LegendDot color={theme.colors.accentGoldTint} label="Busy" />
          <LegendDot color={theme.colors.brandEmerald} label="Has job" />
        </Box>
      </Box>
    </Box>
  );
}
