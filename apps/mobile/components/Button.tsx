/** Figma Button: flat fill, 12px radius, adaptive 44/52px targets and visible states. */
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { AnimatedPressable } from './Pressable.js';
import type { Theme } from '../theme/theme.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md';
interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: IconName;
  /** Radio-style selection, for mutually exclusive choices. */
  selected?: boolean;
}
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  leftIcon,
  selected,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inactive = disabled || loading;
  const active = !inactive && (pressed || hovered);
  const fg: keyof Theme['colors'] = disabled
    ? 'inkMuted'
    : variant === 'primary'
      ? 'inkOnAccent'
      : variant === 'danger'
        ? 'inkOnDanger'
        : 'inkStrong';
  const bg = disabled
    ? theme.colors.actionDisabled
    : variant === 'primary'
      ? active
        ? theme.colors.actionPrimaryPressed
        : theme.colors.brandAccent
      : variant === 'danger'
        ? active
          ? theme.colors.actionDangerPressed
          : theme.colors.dangerSurface
        : active
          ? theme.colors.bgSurfaceAlt
          : variant === 'secondary'
            ? theme.colors.bgSurface
            : 'transparent';
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={inactive}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setPressed(false);
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{
        disabled: inactive,
        busy: loading,
        ...(selected === undefined ? {} : { checked: selected }),
      }}
      style={{
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        minHeight: size === 'lg' ? 52 : 44,
        minWidth: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing['200'],
        paddingHorizontal: theme.spacing[size === 'lg' ? '600' : '500'],
        paddingVertical: theme.spacing['300'],
        borderRadius: theme.borderRadii.md,
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor:
          variant === 'secondary' && !disabled ? theme.colors.borderControl : 'transparent',
        outlineWidth: focused ? 3 : 0,
        outlineColor: theme.colors.borderFocus,
        outlineOffset: 2,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors[fg]} />
      ) : leftIcon ? (
        <Icon name={leftIcon} size={18} color={fg} />
      ) : null}
      <Text
        variant={size === 'lg' ? 'labelLg' : 'label'}
        color={fg}
        style={{ flexShrink: 1, textAlign: 'center' }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
