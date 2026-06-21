/**
 * IconCircle — matches Figma `IconCircle` (95:1028): a 48px tinted circle with a
 * 24px DARK icon (the file keeps the icon its own ink colour). Tones set the
 * tint only: Brand / Gold / Danger / Info / Neutral.
 */
import { useTheme, Box } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type CircleTone = 'brand' | 'gold' | 'danger' | 'info' | 'neutral' | 'success';

const BG: Record<CircleTone, keyof Theme['colors']> = {
  brand: 'brandEmeraldTint',
  gold: 'accentGoldTint',
  danger: 'statusDangerTint',
  info: 'statusInfoTint',
  neutral: 'bgSubtle',
  success: 'statusSuccessTint',
};

interface IconCircleProps {
  icon: IconName;
  tone?: CircleTone;
  size?: number;
  /** Icon colour; defaults to ink (matches the file). */
  iconColor?: keyof Theme['colors'];
}

export function IconCircle({ icon, tone = 'brand', size = 48, iconColor = 'inkStrong' }: IconCircleProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors[BG[tone]],
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={iconColor} />
    </Box>
  );
}
