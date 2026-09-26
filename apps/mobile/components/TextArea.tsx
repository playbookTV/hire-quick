/** Multiline Figma TextField, using the same tokens as Input. */
import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/restyle.js';
import { controlTokens } from '../theme/token-manager.js';

export interface TextAreaProps extends Omit<TextInputProps, 'style' | 'multiline'> {
  error?: boolean;
  minHeight?: number;
}

export function TextArea({
  error = false,
  minHeight = 88,
  onFocus,
  onBlur,
  ...props
}: TextAreaProps): React.JSX.Element {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderWidth = focused || error ? controlTokens.activeBorder : controlTokens.border;

  const borderColor = error
    ? theme.colors.statusDanger
    : focused
      ? theme.colors.borderFocus
      : theme.colors.borderControl;

  return (
    <TextInput
      multiline
      textAlignVertical="top"
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
        minHeight,
        padding: theme.spacing['400'] - (borderWidth - controlTokens.border),
        borderRadius: theme.borderRadii.md,
        borderWidth,
        outlineWidth: 0,
        opacity: props.editable === false ? 0.5 : 1,
        borderColor,
        backgroundColor: theme.colors.bgSurface,
        ...theme.textVariants.body,
        color: theme.colors.inkStrong,
      }}
      {...props}
    />
  );
}
