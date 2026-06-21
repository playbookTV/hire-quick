/**
 * Page shell: canvas background + safe-area insets. `scroll` wraps content in a
 * ScrollView with sensible keyboard handling; otherwise it's a plain Box.
 */
import type { ReactNode } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '../theme/restyle.js';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Pad the top by the safe-area inset (use when there's no AppBar). */
  topInset?: boolean;
  padding?: boolean;
}

export function Screen({
  children,
  scroll = false,
  topInset = false,
  padding = true,
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const pad = padding ? ('500' as const) : ('none' as const);

  const body = (
    <Box flex={1} backgroundColor="bgCanvas" paddingHorizontal={pad} style={{ paddingTop: topInset ? insets.top : 0 }}>
      {children}
    </Box>
  );

  if (!scroll) return body;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Box flex={1} backgroundColor="bgCanvas">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: padding ? 20 : 0,
            paddingTop: topInset ? insets.top + 8 : 8,
            paddingBottom: insets.bottom + 32,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Box>
    </KeyboardAvoidingView>
  );
}
