/** Figma filter chip with a persistent selection mark and native touch target. */
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';
import { Icon } from './Icon.js';
import { canvasTokens } from '../theme/token-manager.js';
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'filter' | 'tab';
}
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  variant = 'filter',
}: ChipProps): React.JSX.Element {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const fg = disabled
    ? 'inkMuted'
    : selected
      ? pressed
        ? 'inkOnAccent'
        : variant === 'filter'
          ? 'inkOnElevated'
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
        paddingHorizontal: theme.spacing[variant === 'tab' ? '500' : '300'],
        paddingVertical: theme.spacing['200'],
        borderRadius: theme.borderRadii.pill,
        borderWidth: selected ? 0 : variant === 'tab' ? 1 : 1.5,
        borderColor: variant === 'tab' ? theme.colors.borderDefault : theme.colors.borderControl,
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
      {selected && variant === 'filter' && !disabled && !pressed ? (
        <LinearGradient
          colors={canvasTokens.elevatedGradient}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: theme.borderRadii.pill }]}
        />
      ) : null}
      {selected && variant === 'filter' ? (
        <Box
          width={22}
          height={22}
          borderRadius="pill"
          alignItems="center"
          justifyContent="center"
          style={{
            backgroundColor: canvasTokens.selectionWell,
            borderBottomWidth: 1,
            borderBottomColor: canvasTokens.selectionEdge,
          }}
        >
          <Icon name="check" size={13} color="inkOnElevated" />
        </Box>
      ) : null}
      <Text variant="label" color={fg} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
