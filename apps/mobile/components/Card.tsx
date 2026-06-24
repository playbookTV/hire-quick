/**
 * Card — the standard surface used across the file: white/dark panel, 1px
 * border/default, radius lg, 16px padding, Shadow/sm.
 */
import type { ReactNode } from 'react';
import { Box } from '../theme/restyle.js';
import { shadowSm } from '../theme/shadows.js';
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
      style={shadowSm}
    >
      {children}
    </Box>
  );
  if (!onPress) return inner;
  return <AnimatedPressable onPress={onPress}>{inner}</AnimatedPressable>;
}
