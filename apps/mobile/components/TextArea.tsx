/**
 * TextArea — matches Figma `TextArea` (120:72): white surface, 1.5px
 * border/default, radius md, 16px padding, min height 88, Body/M text with an
 * ink/faint placeholder, top-aligned. Focus/error borders are added states.
 */
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
      ? theme.colors.brandEmerald
      : theme.colors.borderDefault;

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
        borderWidth: 1.5,
        borderColor,
        backgroundColor: theme.colors.bgSurface,
        fontFamily: 'PlusJakartaSans_400Regular',
        fontSize: 15,
        lineHeight: 22,
        color: theme.colors.inkStrong,
      }}
      {...props}
    />
  );
}
