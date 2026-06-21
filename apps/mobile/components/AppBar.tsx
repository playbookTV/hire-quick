/**
 * AppBar — matches Figma `AppBar` (17:2): 56px canvas bar, a 40px back control
 * with a 24px chevron, and a Heading/S title (Fraunces 18/24). `right` is an
 * optional trailing slot.
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
    <Box backgroundColor="bgCanvas" style={{ paddingTop: inset ? insets.top : 0 }}>
      <Box
        flexDirection="row"
        alignItems="center"
        style={{ height: 56, paddingLeft: 12, paddingRight: 16, gap: 6 }}
      >
        {showBack ? (
          <Pressable
            onPress={back}
            hitSlop={6}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevron-left" size={24} color="inkStrong" />
          </Pressable>
        ) : null}
        <Text variant="headingS" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </Box>
    </Box>
  );
}
