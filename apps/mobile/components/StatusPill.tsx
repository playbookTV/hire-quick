/**
 * StatusPill — matches Figma `StatusPill` (84:32). Each booking/event status has
 * an intrinsic bg + text colour + label (Label/M, px12/py5, radius pill).
 * Booking colours are taken verbatim from the file; event statuses extend the
 * same palette.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

type C = keyof Theme['colors'];
interface Entry {
  label: string;
  bg: C;
  fg: C;
}

const STATUS: Record<string, Entry> = {
  // booking lifecycle (exact Figma mapping)
  CONFIRMED: { label: 'Booked', bg: 'statusSuccessTint', fg: 'statusSuccess' },
  CHECKED_IN: { label: 'Checked in', bg: 'statusInfoTint', fg: 'statusInfo' },
  COMPLETED: { label: 'Completed', bg: 'brandEmeraldTint', fg: 'brandEmerald' },
  PAID: { label: 'Paid', bg: 'brandEmerald', fg: 'inverseInk' },
  PENDING_PAYMENT: { label: 'Pending', bg: 'bgSubtle', fg: 'inkMuted' },
  CANCELLED: { label: 'Cancelled', bg: 'statusDangerTint', fg: 'statusDanger' },
  NO_SHOW: { label: 'No-show', bg: 'statusDangerTint', fg: 'statusDanger' },
  DISPUTED: { label: 'Disputed', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  REFUNDED: { label: 'Refunded', bg: 'bgSubtle', fg: 'inkMuted' },
  HELD: { label: 'Held', bg: 'accentGoldTint', fg: 'statusHeld' },
  // event lifecycle (same palette)
  DRAFT: { label: 'Draft', bg: 'bgSubtle', fg: 'inkMuted' },
  OPEN: { label: 'Open', bg: 'statusInfoTint', fg: 'statusInfo' },
  PARTIALLY_STAFFED: { label: 'Partially staffed', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  FULLY_STAFFED: { label: 'Fully staffed', bg: 'brandEmeraldTint', fg: 'brandEmerald' },
  IN_PROGRESS: { label: 'In progress', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps): React.JSX.Element {
  const theme = useTheme();
  const entry = STATUS[status] ?? { label: label ?? status, bg: 'bgSubtle' as C, fg: 'inkMuted' as C };
  return (
    <Box
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: theme.borderRadii.pill,
        backgroundColor: theme.colors[entry.bg],
      }}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: 13,
          lineHeight: 16,
          letterSpacing: 0.2,
          color: theme.colors[entry.fg],
        }}
      >
        {label ?? entry.label}
      </Text>
    </Box>
  );
}
