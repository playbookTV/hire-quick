/**
 * Dot — matches Figma `Dot` (121:76): a 12px indicator dot. Filled = emerald,
 * empty = bg/inset. Use in carousels / pagers.
 */
import { useTheme, Box } from '../theme/restyle.js';

interface DotProps {
  filled?: boolean;
  size?: number;
}

export function Dot({ filled = false, size = 12 }: DotProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: filled ? theme.colors.brandEmerald : theme.colors.bgInset,
      }}
    />
  );
}
