/** Figma AppBar: canvas, 44px back control, Archivo title and optional trailing action. */
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

export function AppBar({
  title,
  showBack = false,
  onBack,
  right,
  inset = true,
}: AppBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => router.back());

  return (
    <Box backgroundColor="bgCanvas" style={{ paddingTop: inset ? insets.top : 0 }}>
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ minHeight: 56, paddingLeft: 24, paddingRight: 24, gap: 12 }}
      >
        {showBack ? (
          <Pressable
            onPress={back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevron-left" size={24} color="inkStrong" />
          </Pressable>
        ) : null}
        <Text variant="headingS" style={{ flex: 1 }}>
          {title}
        </Text>
        {right}
      </Box>
    </Box>
  );
}
