/**
 * ProgressBar — matches Figma `ProgressBar` (121:72): 8px bg/inset track with an
 * emerald fill (recolourable). `progress` is 0–1.
 */
import { useTheme, Box } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

interface ProgressBarProps {
  progress: number;
  color?: keyof Theme['colors'];
}

export function ProgressBar({ progress, color = 'brandEmerald' }: ProgressBarProps): React.JSX.Element {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <Box
      style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: theme.colors.bgInset }}
    >
      <Box style={{ height: 8, borderRadius: 999, width: `${pct * 100}%`, backgroundColor: theme.colors[color] }} />
    </Box>
  );
}
