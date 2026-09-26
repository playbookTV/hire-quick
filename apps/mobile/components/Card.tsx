/** Flat bordered Figma surface, with optional accessible press behavior. */
import type { ReactNode } from 'react';
import { Box } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
}

export function Card({ children, onPress, padded = true }: CardProps): React.JSX.Element {
  const inner = (
    <Box
      backgroundColor="bgSurface"
      borderRadius="lg"
      borderWidth={1}
      borderColor="borderDefault"
      padding={padded ? '400' : 'none'}
    >
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
