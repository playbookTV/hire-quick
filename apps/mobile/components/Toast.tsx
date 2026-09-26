/**
 * ToastHost — the on-screen renderer for the toast system (state lives in
 * lib/toast.tsx). A non-blocking banner that slides in just below the status bar,
 * reusing the Banner visual language (tinted surface + tone colour). Tap to
 * dismiss; auto-dismiss is driven by the provider. Kept mounted (the positioned
 * Box never unmounts) so the exit animation can play when the toast clears.
 */
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { shadowMd } from '../theme/shadows.js';
import { fonts } from '../theme/fonts.js';
import type { Theme } from '../theme/theme.js';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
}

const TONE: Record<
  ToastTone,
  {
    fg: keyof Theme['colors'];
    bg: keyof Theme['colors'];
    border: keyof Theme['colors'];
    icon: IconName;
  }
> = {
  success: {
    fg: 'statusSuccess',
    bg: 'statusSuccessTint',
    border: 'borderDefault',
    icon: 'check-circle',
  },
  error: {
    fg: 'statusDanger',
    bg: 'statusDangerTint',
    border: 'borderDefault',
    icon: 'alert-circle',
  },
  info: { fg: 'statusInfo', bg: 'statusInfoTint', border: 'borderDefault', icon: 'info' },
};

interface ToastHostProps {
  toast: ToastItem | null;
  onDismiss: () => void;
}

export function ToastHost({ toast, onDismiss }: ToastHostProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = toast ? TONE[toast.tone] : null;

  return (
    <Box
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 1000 }}
    >
      {toast && t ? (
        <Animated.View
          key={toast.id}
          entering={SlideInUp.springify().damping(18)}
          exiting={SlideOutUp.duration(200)}
        >
          <Pressable
            onPress={onDismiss}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`${toast.title ? toast.title + '. ' : ''}${toast.message}`}
          >
            <Box
              flexDirection="row"
              alignItems="center"
              style={[
                {
                  gap: 12,
                  padding: 14,
                  borderRadius: theme.borderRadii.md,
                  backgroundColor: theme.colors[t.bg],
                  borderWidth: 1,
                  borderColor: theme.colors[t.border],
                },
                shadowMd,
              ]}
            >
              <Icon name={t.icon} size={20} color={t.fg} />
              <Box flex={1}>
                {toast.title ? (
                  <Text
                    style={{
                      fontFamily: fonts.sansSemibold,
                      fontSize: 13,
                      lineHeight: 18,
                      color: theme.colors[t.fg],
                    }}
                  >
                    {toast.title}
                  </Text>
                ) : null}
                <Text
                  style={{
                    fontFamily: fonts.sansRegular,
                    fontSize: 13,
                    lineHeight: 18,
                    color: theme.colors[t.fg],
                  }}
                >
                  {toast.message}
                </Text>
              </Box>
            </Box>
          </Pressable>
        </Animated.View>
      ) : null}
    </Box>
  );
}
