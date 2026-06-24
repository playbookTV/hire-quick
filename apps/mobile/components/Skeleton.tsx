/**
 * Skeleton — content-shaped loading placeholders that gently pulse (Reanimated).
 * Use instead of a bare spinner on data-heavy screens so the layout doesn't jump
 * when data lands. `Skeleton` is the primitive block; `SkeletonRow` (avatar + two
 * lines) and `SkeletonCard` are common shapes for lists/cards.
 */
import { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTheme, Box } from '../theme/restyle.js';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

export function Skeleton({ width = '100%', height = 16, radius = 8 }: SkeletonProps): React.JSX.Element {
  const theme = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.bgInset }, style]}
    />
  );
}

/** Avatar circle + two text lines — matches StaffCard / list-row layouts. */
export function SkeletonRow(): React.JSX.Element {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="lg"
      padding="400"
      style={{ gap: 12 }}
    >
      <Skeleton width={48} height={48} radius={24} />
      <Box flex={1} style={{ gap: 8 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </Box>
      <Skeleton width={64} height={32} radius={999} />
    </Box>
  );
}

/** Full-width card block — header line + body lines. */
export function SkeletonCard({ lines = 2 }: { lines?: number }): React.JSX.Element {
  return (
    <Box
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="lg"
      padding="400"
      style={{ gap: 12 }}
    >
      <Skeleton width="50%" height={16} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </Box>
  );
}
