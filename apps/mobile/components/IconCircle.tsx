/**
 * IconCircle — tinted round icon badge (Figma IconCircle: Tone). Used by
 * QuickActionCard, EmptyState, OptionCard, etc.
 */
import { useTheme, Box } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type CircleTone = 'brand' | 'gold' | 'success' | 'danger' | 'info' | 'neutral';

const TONE: Record<CircleTone, { fg: keyof Theme['colors']; bg: keyof Theme['colors'] }> = {
  brand: { fg: 'brandEmerald', bg: 'brandBg' },
  gold: { fg: 'accentGoldStrong', bg: 'goldBg' },
  success: { fg: 'statusSuccess', bg: 'successBg' },
  danger: { fg: 'statusDanger', bg: 'dangerBg' },
  info: { fg: 'statusInfo', bg: 'infoBg' },
  neutral: { fg: 'inkBody', bg: 'bgMuted' },
};

interface IconCircleProps {
  icon: IconName;
  tone?: CircleTone;
  size?: number;
}

export function IconCircle({ icon, tone = 'brand', size = 44 }: IconCircleProps): React.JSX.Element {
  const theme = useTheme();
  const t = TONE[tone];
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: theme.borderRadii.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors[t.bg],
      }}
    >
      <Icon name={icon} size={size * 0.45} color={t.fg} />
    </Box>
  );
}
