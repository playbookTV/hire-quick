/** Multiline Figma TextField, using the same tokens as Input. */
import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/restyle.js';

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
        padding: 16,
        borderRadius: theme.borderRadii.md,
        borderWidth: focused || error ? 2 : 1.5,
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
