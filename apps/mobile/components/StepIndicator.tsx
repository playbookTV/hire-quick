/**
 * StepIndicator — matches Figma `StepIndicator` (95:45): a gold Overline/S label
 * ("STEP n OF m") above a row of small 10×5 segment pills (filled = emerald).
 */
import { useTheme, Box, Text } from '../theme/restyle.js';

interface StepIndicatorProps {
  total: number;
  current: number; // 0-based
  label?: string;
}

export function StepIndicator({ total, current, label }: StepIndicatorProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Box style={{ gap: 8 }}>
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: 11,
          lineHeight: 14,
          letterSpacing: 1.2,
          color: theme.colors.accentGoldStrong,
        }}
      >
        {label ?? `STEP ${current + 1} OF ${total}`}
      </Text>
      <Box flexDirection="row" style={{ gap: 8 }}>
        {Array.from({ length: total }).map((_, i) => (
          <Box
            key={i}
            style={{
              width: 10,
              height: 5,
              borderRadius: 999,
              backgroundColor: i <= current ? theme.colors.brandEmerald : theme.colors.bgInset,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
