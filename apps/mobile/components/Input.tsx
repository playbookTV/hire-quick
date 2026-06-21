/**
 * Input — matches Figma `Input/Field` (8:4): white surface, 1px border/default,
 * a very subtle drop shadow, 16/12 padding, 12px gap, radius md, Body/M text
 * (PJ Regular 15/22) with an ink/faint placeholder and an optional 20px leading
 * icon. Focus (emerald) and error (danger) borders are added states.
 */
import { useState, forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
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
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: theme.borderRadii.md,
        borderWidth: 1,
        borderColor,
        backgroundColor: theme.colors.bgSurface,
        shadowColor: '#0A0D14',
        shadowOpacity: 0.03,
        shadowRadius: 1,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {leftIcon ? <Icon name={leftIcon} size={20} color="inkFaint" /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.inkFaint}
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
          lineHeight: 22,
          color: theme.colors.inkStrong,
          paddingVertical: 0,
        }}
        {...props}
      />
    </View>
  );
});
