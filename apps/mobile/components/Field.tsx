/**
 * Field — matches Figma `Field` (89:973): Label (Label/M, ink/muted) + control +
 * optional helper (Body/S, ink/faint), stacked with 8px gaps. Error text reuses
 * the helper slot in danger.
 */
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { useTheme, Box, Text } from '../theme/restyle.js';

interface FieldProps {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, helper, error, required, children }: FieldProps): React.JSX.Element {
  const theme = useTheme();
  // Associate the visible label (and any error) with the control for screen readers —
  // Input/TextArea spread props onto their TextInput, so these land on the field itself (S8).
  const control =
    isValidElement(children) && (label || error)
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          accessibilityLabel:
            (children.props as { accessibilityLabel?: string }).accessibilityLabel ?? label,
          ...(error ? { accessibilityHint: error } : {}),
        })
      : children;
  return (
    <Box marginBottom="400" style={{ gap: 8 }}>
      {label ? (
        <Box flexDirection="row">
          <Text
            style={{
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 13,
              lineHeight: 16,
              letterSpacing: 0.2,
              color: theme.colors.inkMuted,
            }}
          >
            {label}
          </Text>
          {required ? (
            <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: theme.colors.statusDanger }}>
              {' *'}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {control}
      {error ? (
        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: theme.colors.statusDanger }}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18, color: theme.colors.inkFaint }}>
          {helper}
        </Text>
      ) : null}
    </Box>
  );
}
