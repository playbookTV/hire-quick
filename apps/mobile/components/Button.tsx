/**
 * Button — matches Figma `Button` (6:18). Variants Primary / Secondary / Ghost /
 * Danger × sizes lg / md. Primary & Danger are vertical gradients with a 1px
 * inner ring, soft drop shadow, and a subtle text-shadow (the premium glossy
 * treatment in the file). Secondary is a white surface with a soft ring; Ghost
 * is text-only. Full-width by default (set the instance to Fill in Figma).
 */
import { View, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
}

const SIZE: Record<ButtonSize, { ph: number; pv: number; radius: number; fontSize: number; lineHeight: number; ls: number }> = {
  lg: { ph: 24, pv: 16, radius: 16, fontSize: 15, lineHeight: 20, ls: 0 },
  md: { ph: 20, pv: 12, radius: 12, fontSize: 13, lineHeight: 16, ls: 0.2 },
};

// Gradient treatments are a fixed visual style in the file (not theme tokens).
// `border` is the 1px edge (the gradient's top colour); `ring` is the
// `0 0 0 1px` outer ring drawn just outside it via the second box-shadow layer.
const GRADIENT: Record<
  'primary' | 'danger',
  {
    colors: readonly [string, string, ...string[]];
    locations?: readonly [number, number, ...number[]];
    border: string;
    ring: string;
  }
> = {
  // Figma stops: #15D1A2 @ -123.08%, #0B6B53 @ 76.92%. Mapped into the visible
  // 0–100% band the top resolves to ~#0F9271, then holds flat #0B6B53 past 77%.
  primary: { colors: ['#0F9271', '#0B6B53', '#0B6B53'], locations: [0, 0.7692, 1], border: '#15D1A2', ring: '#0B6B53' },
  danger: { colors: ['#EA4426', '#C2381F'], border: '#FFAB9C', ring: '#C2381F' },
};

// box-shadow: 0 1px 2px rgba(14,18,27,.24) drop + 0 0 0 1px <ring> outer ring.
const ringShadow = (ring: string): string =>
  `0px 1px 2px 0px rgba(14, 18, 27, 0.24), 0px 0px 0px 1px ${ring}`;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  leftIcon,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const s = SIZE[size];
  const isDisabled = disabled || loading;

  const fg: keyof Theme['colors'] =
    variant === 'secondary' ? 'inkStrong' : variant === 'ghost' ? 'brandEmerald' : 'inverseInk';
  const textShadow = variant === 'primary' || variant === 'danger';

  const inner: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: s.ph,
    paddingVertical: s.pv,
    borderRadius: s.radius,
  };

  const content = loading ? (
    <ActivityIndicator color={theme.colors[fg]} />
  ) : (
    <>
      {leftIcon ? <Icon name={leftIcon} size={size === 'lg' ? 18 : 16} color={fg} /> : null}
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          letterSpacing: s.ls,
          color: theme.colors[fg],
          ...(textShadow
            ? { textShadowColor: 'rgba(0,0,0,0.27)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 }
            : null),
        }}
      >
        {label}
      </Text>
    </>
  );

  const body =
    variant === 'primary' || variant === 'danger' ? (
      <LinearGradient
        colors={GRADIENT[variant].colors}
        locations={GRADIENT[variant].locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[inner, { borderWidth: 1, borderColor: GRADIENT[variant].border, boxShadow: ringShadow(GRADIENT[variant].ring) }]}
      >
        {content}
      </LinearGradient>
    ) : variant === 'secondary' ? (
      <View
        style={[
          inner,
          styles.softShadow,
          { backgroundColor: theme.colors.bgSurface, borderWidth: 1, borderColor: theme.colors.borderDefault },
        ]}
      >
        {content}
      </View>
    ) : (
      <View style={inner}>{content}</View>
    );

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={{
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      {body}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  softShadow: {
    shadowColor: '#0E1219',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
