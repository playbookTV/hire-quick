/**
 * StepIndicator — progress dots/bars for multi-step flows (Figma StepIndicator).
 */
import { useTheme, Box } from '../theme/restyle.js';

interface StepIndicatorProps {
  total: number;
  current: number; // 0-based
}

export function StepIndicator({ total, current }: StepIndicatorProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box flexDirection="row" gap="150">
      {Array.from({ length: total }).map((_, i) => (
        <Box
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 2,
            backgroundColor: i <= current ? theme.colors.brandEmerald : theme.colors.borderDefault,
          }}
        />
      ))}
    </Box>
  );
}
