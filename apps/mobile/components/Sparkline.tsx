/**
 * Sparkline — a tiny 7-slot bar chart for the earnings hero (DoorDash Dasher
 * pattern, scaled down). Each slot is a faint track with an accent fill from the
 * bottom, proportional to that slot's value vs the series max; bars rise with a
 * staggered spring on mount. Colours are passed in (raw strings) so it can sit on
 * the emerald EarningsCard where theme tokens don't read.
 */
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Box } from '../theme/restyle.js';

interface SparklineProps {
  values: number[];
  height?: number;
  /** Fill colour for the bars (e.g. resolved theme.colors.accentGold). */
  barColor: string;
  /** Track colour behind each bar. */
  trackColor: string;
}

export function Sparkline({ values, height = 36, barColor, trackColor }: SparklineProps): React.JSX.Element {
  const max = Math.max(1, ...values);
  return (
    <Box flexDirection="row" alignItems="flex-end" style={{ gap: 6, height }}>
      {values.map((v, i) => {
        const fill = Math.max(3, Math.round((v / max) * height));
        return (
          <Box
            key={i}
            flex={1}
            justifyContent="flex-end"
            style={{ height, borderRadius: 4, backgroundColor: trackColor, overflow: 'hidden' }}
          >
            <Animated.View
              entering={FadeInUp.delay(i * 45).springify().damping(16)}
              style={{ height: fill, borderRadius: 4, backgroundColor: barColor }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
