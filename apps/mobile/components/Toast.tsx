/**
 * ToastHost — the on-screen renderer for the toast system (state lives in
 * lib/toast.tsx). A non-blocking banner that fades in just below the status bar,
 * reusing the Banner visual language (tinted surface + tone colour). Tap to
 * dismiss; auto-dismiss is driven by the provider. Kept mounted (the positioned
 * Box never unmounts) so the exit animation can play when the toast clears.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { shadowMd } from '../theme/shadows.js';
import { motionTokens, screenTokens } from '../theme/token-manager.js';
import { useMotionPreference } from '../lib/use-motion-preference.js';
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

// ToastHost removes both animations while the live reduced-motion preference is enabled.
const toastEasing = Easing.bezier(...motionTokens.easeOut);
const enterToast = FadeIn.duration(motionTokens.toast.inMs)
  .easing(toastEasing)
  .reduceMotion(ReduceMotion.Never);
const exitToast = FadeOut.duration(motionTokens.toast.outMs)
  .easing(toastEasing)
  .reduceMotion(ReduceMotion.Never);

export function ToastHost({ toast, onDismiss }: ToastHostProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useMotionPreference();
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const t = toast ? TONE[toast.tone] : null;

  return (
    <Box
      style={{
        pointerEvents: 'box-none',
        position: 'absolute',
        top: insets.top + theme.spacing['200'],
        left: theme.spacing['400'],
        right: theme.spacing['400'],
        zIndex: 1000,
      }}
    >
      {toast && t ? (
        <Animated.View
          key={toast.id}
          entering={reduced ? undefined : enterToast}
          exiting={reduced ? undefined : exitToast}
        >
          <Pressable
            onPress={onDismiss}
            onFocus={() => setFocusedId(toast.id)}
            onBlur={() => setFocusedId(null)}
            accessibilityRole="button"
            accessibilityHint="Dismiss notification"
            accessibilityLabel={`${toast.title ? toast.title + '. ' : ''}${toast.message}`}
          >
            <Box
              flexDirection="row"
              alignItems="center"
              style={[
                {
                  gap: theme.spacing['300'],
                  padding: theme.spacing['400'],
                  minHeight: screenTokens.touchTarget,
                  borderRadius: theme.borderRadii.md,
                  backgroundColor: theme.colors[t.bg],
                  borderWidth: 1,
                  borderColor: theme.colors[t.border],
                  outlineWidth: focusedId === toast.id ? 3 : 0,
                  outlineColor: theme.colors.borderFocus,
                  outlineOffset: 2,
                },
                shadowMd,
              ]}
            >
              <Icon name={t.icon} size={20} color={t.fg} />
              <Box flex={1}>
                {toast.title ? (
                  <Text variant="label" color={t.fg}>
                    {toast.title}
                  </Text>
                ) : null}
                <Text variant="bodySm" color={t.fg}>
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
