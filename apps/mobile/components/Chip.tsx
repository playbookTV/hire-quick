/** Figma filter chip with a persistent selection mark and native touch target. */
import { useState } from 'react';
import { useTheme, Text } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: ChipProps): React.JSX.Element {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const fg = disabled
    ? 'inkMuted'
    : selected
      ? pressed
        ? 'inkOnAccent'
        : 'inkInverse'
      : 'inkDefault';
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      scaleTo={1}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      aria-pressed={selected}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing['150'],
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: theme.spacing['300'],
        paddingVertical: theme.spacing['200'],
        borderRadius: theme.borderRadii.pill,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.bgInverse : theme.colors.borderControl,
        backgroundColor: disabled
          ? theme.colors.actionDisabled
          : selected
            ? pressed
              ? theme.colors.brandAccent
              : theme.colors.bgInverse
            : pressed
              ? theme.colors.bgSurfaceAlt
              : theme.colors.bgSurface,
        outlineWidth: focused ? 3 : 0,
        outlineColor: theme.colors.borderFocus,
        outlineOffset: 2,
      }}
    >
      {selected ? (
        <Text variant="label" color={fg} accessible={false}>
          ✓
        </Text>
      ) : null}
      <Text variant="label" color={fg} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
