/**
 * Input — single-line text field with optional leading icon, focus + error
 * states. Mirrors the Figma Input/Field component.
 */
import { useState, forwardRef } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  leftIcon?: IconName;
  error?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { leftIcon, error = false, onFocus, onBlur, ...props },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.statusDanger
    : focused
      ? theme.colors.brandEmerald
      : theme.colors.borderDefault;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        paddingHorizontal: 14,
        gap: 10,
        borderRadius: theme.borderRadii.md,
        borderWidth: 1,
        borderColor,
        backgroundColor: theme.colors.bgSurface,
      }}
    >
      {leftIcon ? <Icon name={leftIcon} size={18} color="inkMuted" /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.inkMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          flex: 1,
          fontFamily: 'PlusJakartaSans_400Regular',
          fontSize: 15,
          color: theme.colors.inkStrong,
          paddingVertical: 0,
        }}
        {...props}
      />
    </View>
  );
});
