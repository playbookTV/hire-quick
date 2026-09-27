/** Figma StatusPill; payment labels distinguish wallet release from bank withdrawal. */
import { useTheme, Box, Text } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';
import { Image } from 'expo-image';
import statusDot from '../assets/icons/status-dot.svg';

type C = keyof Theme['colors'];
interface Entry {
  label: string;
  bg: C;
  fg: C;
}

const STATUS: Record<string, Entry> = {
  VERIFIED: { label: 'Identity verified', bg: 'statusSuccessTint', fg: 'statusSuccess' },
  VERIFICATION_PENDING: {
    label: 'Verification pending',
    bg: 'statusWarningTint',
    fg: 'statusWarning',
  },
  VERIFICATION_REJECTED: {
    label: 'Verification rejected',
    bg: 'statusDangerTint',
    fg: 'statusDanger',
  },
  // booking lifecycle (exact Figma mapping)
  CONFIRMED: { label: 'Confirmed', bg: 'statusSuccessTint', fg: 'statusSuccess' },
  CHECKED_IN: { label: 'Checked in', bg: 'statusInfoTint', fg: 'statusInfo' },
  COMPLETED: { label: 'Work completed', bg: 'statusSuccessTint', fg: 'statusSuccess' },
  PAID: { label: 'Paid', bg: 'statusSuccessTint', fg: 'moneyAvailable' },
  PENDING_PAYMENT: { label: 'Awaiting payment', bg: 'statusWarningTint', fg: 'statusWarning' },
  CANCELLED: { label: 'Cancelled', bg: 'bgSubtle', fg: 'inkMuted' },
  NO_SHOW: { label: 'No-show', bg: 'statusDangerTint', fg: 'statusDanger' },
  DISPUTED: { label: 'Disputed', bg: 'statusDangerTint', fg: 'statusDanger' },
  REFUNDED: { label: 'Refunded', bg: 'statusInfoTint', fg: 'statusInfo' },
  HELD: { label: 'Funds held', bg: 'accentGoldTint', fg: 'statusHeld' },
  RELEASED: { label: 'Released', bg: 'statusSuccessTint', fg: 'moneyAvailable' },
  WITHDRAWN: { label: 'Withdrawn', bg: 'bgSubtle', fg: 'inkDefault' },
  // event lifecycle (same palette)
  DRAFT: { label: 'Draft', bg: 'bgSubtle', fg: 'inkMuted' },
  OPEN: { label: 'Open', bg: 'statusInfoTint', fg: 'statusInfo' },
  PARTIALLY_STAFFED: { label: 'Partially staffed', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  FULLY_STAFFED: { label: 'Fully staffed', bg: 'brandEmeraldTint', fg: 'brandEmerald' },
  IN_PROGRESS: { label: 'In progress', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  REQUESTED: { label: 'Requested', bg: 'bgSubtle', fg: 'inkMuted' },
  PROCESSING: { label: 'Processing', bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  FAILED: { label: 'Failed / reversed', bg: 'statusDangerTint', fg: 'statusDanger' },
  // invitation lifecycle
  SENT: { label: 'Pending', bg: 'bgSubtle', fg: 'inkMuted' },
  ACCEPTED: { label: 'Accepted', bg: 'brandEmeraldTint', fg: 'brandEmerald' },
  DECLINED: { label: 'Declined', bg: 'statusDangerTint', fg: 'statusDanger' },
  EXPIRED: { label: 'Expired', bg: 'bgSubtle', fg: 'inkMuted' },
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps): React.JSX.Element {
  const theme = useTheme();
  const entry = STATUS[status] ?? { label: label ?? status, bg: 'bgSubtle', fg: 'inkMuted' };
  return (
    <Box
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing['150'],
        paddingHorizontal: theme.spacing['200'],
        paddingVertical: theme.spacing['100'],
        borderRadius: theme.borderRadii.pill,
        backgroundColor: theme.colors[entry.bg],
      }}
    >
      <Image
        source={statusDot}
        tintColor={theme.colors[entry.fg]}
        style={{ width: 6, height: 6 }}
        accessible={false}
      />
      <Text variant="label" color={entry.fg} style={{ flexShrink: 1 }}>
        {label ?? entry.label}
      </Text>
    </Box>
  );
}
