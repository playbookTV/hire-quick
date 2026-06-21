/**
 * AppBar — screen header with optional back button and a right-hand slot
 * (Figma AppBar). Use as a stack header or inline at the top of a screen.
 */
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Box, Text } from '../theme/restyle.js';
import { Icon } from './Icon.js';

interface AppBarProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  inset?: boolean;
}

export function AppBar({ title, showBack = false, onBack, right, inset = true }: AppBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => router.back());

  return (
    <Box
      backgroundColor="bgCanvas"
      style={{ paddingTop: inset ? insets.top : 0 }}
    >
      <Box
        flexDirection="row"
        alignItems="center"
        paddingHorizontal="500"
        style={{ height: 52 }}
      >
        {showBack ? (
          <Pressable onPress={back} hitSlop={10} style={{ marginRight: 8 }}>
            <Icon name="chevron-left" size={26} color="inkStrong" />
          </Pressable>
        ) : null}
        <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </Box>
    </Box>
  );
}
