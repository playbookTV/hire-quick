/**
 * StatusPill — intrinsic colour + label per status (Figma StatusPill). Covers
 * event + booking lifecycle states; the label maps the stored enum to UX copy.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'held' | 'neutral';

interface ToneStyle {
  fg: keyof Theme['colors'];
  bg: keyof Theme['colors'];
}

const TONE: Record<Tone, ToneStyle> = {
  brand: { fg: 'brandEmerald', bg: 'brandBg' },
  success: { fg: 'statusSuccess', bg: 'successBg' },
  warning: { fg: 'statusWarning', bg: 'warningBg' },
  danger: { fg: 'statusDanger', bg: 'dangerBg' },
  info: { fg: 'statusInfo', bg: 'infoBg' },
  held: { fg: 'statusHeld', bg: 'heldBg' },
  neutral: { fg: 'inkMuted', bg: 'bgMuted' },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // event
  DRAFT: { label: 'Draft', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'info' },
  PARTIALLY_STAFFED: { label: 'Partially staffed', tone: 'warning' },
  FULLY_STAFFED: { label: 'Fully staffed', tone: 'brand' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  // booking
  PENDING_PAYMENT: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Booked', tone: 'brand' },
  CHECKED_IN: { label: 'Checked in', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
  DISPUTED: { label: 'Disputed', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  HELD: { label: 'Held', tone: 'held' },
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps): React.JSX.Element {
  const theme = useTheme();
  const entry = STATUS[status] ?? { label: label ?? status, tone: 'neutral' as Tone };
  const tone = TONE[entry.tone];
  return (
    <Box
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadii.pill,
        backgroundColor: theme.colors[tone.bg],
      }}
    >
      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: theme.colors[tone.fg] }}>
        {label ?? entry.label}
      </Text>
    </Box>
  );
}
