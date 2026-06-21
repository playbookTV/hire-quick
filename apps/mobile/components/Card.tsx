/**
 * Card — the standard surface (white/dark panel, hairline border, rounded). Most
 * Figma cards are this plus content.
 */
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Box } from '../theme/restyle.js';

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
      padding={padded ? '500' : 'none'}
    >
      {children}
    </Box>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {inner}
    </Pressable>
  );
}
