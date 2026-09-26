/**
 * AnimatedPressable — the standard tappable surface. A subtle scale-down
 * on press-in (Reanimated) plus optional selection haptic gives every tap a
 * premium, tactile feel. Drop-in replacement for RN `Pressable` (forwards
 * onPress/disabled/accessibility props); pass `scaleTo`/`haptic` to tune it.
 *
 * Keep `style` a plain ViewStyle (not the function form) — the press visual is
 * handled here via transform, so callers don't need the `pressed` callback.
 */
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { hapticSelection, hapticImpact, type HapticImpact } from '../lib/haptics.js';
import { useMotionPreference } from '../lib/use-motion-preference.js';
import { motionTokens } from '../theme/token-manager.js';

const Base = Animated.createAnimatedComponent(Pressable);

const easing = Easing.bezier(...motionTokens.easeOut);

type HapticKind = 'selection' | HapticImpact | 'none';

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Pressed-state scale. 1 disables the scale animation. Default 0.96. */
  scaleTo?: number;
  /** Disable movement for frequently repeated or spatially fixed controls. */
  static?: boolean;
  /** Haptic fired on press-in. Default 'selection'; 'none' to disable. */
  haptic?: HapticKind;
}

export function AnimatedPressable({
  children,
  style,
  scaleTo = motionTokens.press.scale,
  static: staticPress = false,
  haptic = 'selection',
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: AnimatedPressableProps): React.JSX.Element {
  const scale = useSharedValue(1);
  const reduced = useMotionPreference();
  // The live preference hook owns reduction; Reanimated's System value is a startup snapshot.
  const still = staticPress || reduced || disabled || scaleTo === 1;
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (still) {
      cancelAnimation(scale);
      scale.value = 1;
    }
    return () => cancelAnimation(scale);
  }, [scale, still]);

  return (
    <Base
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) {
          // Web keyboard presses retain color feedback without movement.
          if (!still && !('key' in e.nativeEvent)) {
            scale.value = withTiming(scaleTo, {
              duration: motionTokens.press.inMs,
              easing,
              reduceMotion: ReduceMotion.Never,
            });
          }
          if (haptic === 'selection') hapticSelection();
          else if (haptic !== 'none') hapticImpact(haptic);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = still
          ? 1
          : withTiming(1, {
              duration: motionTokens.press.outMs,
              easing,
              reduceMotion: ReduceMotion.Never,
            });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </Base>
  );
}
