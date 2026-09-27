/** Figma TextField control with adaptive height and semantic focus/error borders. */
import { useState, forwardRef } from 'react';
import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { controlTokens } from '../theme/token-manager.js';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  leftIcon?: IconName;
  /** Leading text affordance (e.g. a "₦" currency symbol). Rendered before the field. */
  prefix?: string;
  error?: boolean;
  variant?: 'body' | 'code';
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { leftIcon, prefix, error = false, variant = 'body', onFocus, onBlur, ...props },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderWidth = focused || error ? controlTokens.activeBorder : controlTokens.border;
  const borderInset = borderWidth - controlTokens.border;

  const borderColor = error
    ? theme.colors.statusDanger
    : focused
      ? theme.colors.borderFocus
      : theme.colors.borderControl;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing['300'],
        minHeight: variant === 'code' ? 64 : 52,
        opacity: props.editable === false ? 0.5 : 1,
        paddingHorizontal: theme.spacing['400'] - borderInset,
        paddingVertical: theme.spacing['300'] - borderInset,
        borderRadius: theme.borderRadii.md,
        borderWidth,
        borderColor,
        backgroundColor: theme.colors.bgSurface,
      }}
    >
      {leftIcon ? <Icon name={leftIcon} size={20} color="inkFaint" /> : null}
      {prefix ? (
        <Text
          style={{
            ...theme.textVariants.body,
            color: theme.colors.inkMuted,
          }}
        >
          {prefix}
        </Text>
      ) : null}
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
          minWidth: 0,
          ...(variant === 'code' ? theme.textVariants.code : theme.textVariants.body),
          color: theme.colors.inkStrong,
          paddingVertical: 0,
          outlineWidth: 0,
          outlineStyle: 'solid',
        }}
        {...props}
      />
    </View>
  );
});
