/**
 * Button — Figma variants Primary / Secondary / Ghost / Danger × sizes sm/md/lg.
 * Interactive, so it reads the theme via `useTheme` and styles a Pressable
 * directly (keeps press/disabled/loading states simple).
 */
import { Pressable, ActivityIndicator, type ViewStyle } from 'react-native';
import { useTheme, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: IconName;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };
const PAD_X: Record<ButtonSize, number> = { sm: 14, md: 18, lg: 22 };

function colorsFor(
  theme: Theme,
  variant: ButtonVariant,
): { bg: string; fg: keyof Theme['colors']; border?: string } {
  switch (variant) {
    case 'primary':
      return { bg: theme.colors.brandEmerald, fg: 'inverseInk' };
    case 'danger':
      return { bg: theme.colors.statusDanger, fg: 'inverseInk' };
    case 'secondary':
      return { bg: theme.colors.bgSurface, fg: 'brandEmerald', border: theme.colors.borderStrong };
    case 'ghost':
      return { bg: 'transparent', fg: 'brandEmerald' };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = true,
  leftIcon,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const { bg, fg, border } = colorsFor(theme, variant);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }): ViewStyle => ({
        height: HEIGHT[size],
        paddingHorizontal: PAD_X[size],
        borderRadius: theme.borderRadii.md,
        backgroundColor: bg,
        borderWidth: border ? 1 : 0,
        borderColor: border,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors[fg]} />
      ) : (
        <>
          {leftIcon ? <Icon name={leftIcon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
          <Text variant="button" color={fg} style={{ fontSize: size === 'sm' ? 14 : 15 }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
