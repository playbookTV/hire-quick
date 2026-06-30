/**
 * AnimatedPressable — the standard tappable surface. A subtle spring scale-down
 * on press-in (Reanimated) plus optional selection haptic gives every tap a
 * premium, tactile feel. Drop-in replacement for RN `Pressable` (forwards
 * onPress/disabled/accessibility props); pass `scaleTo`/`haptic` to tune it.
 *
 * Keep `style` a plain ViewStyle (not the function form) — the press visual is
 * handled here via transform, so callers don't need the `pressed` callback.
 */
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticSelection, hapticImpact, type HapticImpact } from '../lib/haptics.js';

const Base = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;

type HapticKind = 'selection' | HapticImpact | 'none';

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Pressed-state scale. 1 disables the scale animation. Default 0.97. */
  scaleTo?: number;
  /** Haptic fired on press-in. Default 'selection'; 'none' to disable. */
  haptic?: HapticKind;
}

export function AnimatedPressable({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'selection',
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: AnimatedPressableProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Base
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          scale.value = withSpring(scaleTo, SPRING);
          if (haptic === 'selection') hapticSelection();
          else if (haptic !== 'none') hapticImpact(haptic);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, SPRING);
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Base>
  );
}
