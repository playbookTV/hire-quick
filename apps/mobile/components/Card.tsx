/** Flat bordered Figma surface, with optional accessible press behavior. */
import type { ReactNode } from 'react';
import { Box, useTheme } from '../theme/restyle.js';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { canvasTokens } from '../theme/token-manager.js';
import type { Theme } from '../theme/theme.js';
import { AnimatedPressable } from './Pressable.js';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  variant?: 'surface' | 'elevated' | 'borderless';
  padding?: keyof Theme['spacing'];
  radius?: keyof Theme['borderRadii'];
}

export function Card({
  children,
  onPress,
  padded = true,
  variant = 'surface',
  padding,
  radius = 'lg',
}: CardProps): React.JSX.Element {
  const theme = useTheme();
  const inner = (
    <Box
      backgroundColor={variant === 'elevated' ? 'bgElevated' : 'bgSurface'}
      borderRadius={radius}
      borderWidth={variant === 'surface' ? 1 : 0}
      borderColor="borderDefault"
      padding={padding ?? (padded ? '400' : 'none')}
    >
      {variant === 'elevated' ? (
        <LinearGradient
          colors={canvasTokens.elevatedGradient}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: theme.borderRadii[radius] }]}
        />
      ) : null}
      {children}
    </Box>
  );
  if (!onPress) return inner;
  return (
    <AnimatedPressable onPress={onPress} accessibilityRole="button">
      {inner}
    </AnimatedPressable>
  );
}
