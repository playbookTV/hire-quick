/** Label, control and associated helper/error from Figma TextField. */
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { Box, Text } from '../theme/restyle.js';
interface FieldProps {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}
export function Field({ label, helper, error, required, children }: FieldProps): React.JSX.Element {
  const control =
    isValidElement(children) && (label || error || helper)
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          accessibilityLabel:
            (children.props as { accessibilityLabel?: string }).accessibilityLabel ?? label,
          ...(error || helper ? { accessibilityHint: error ?? helper } : {}),
        })
      : children;
  return (
    <Box marginBottom="400" gap="200">
      {label ? (
        <Text variant="label" color="inkDefault">
          {label}
          {required ? <Text color="statusDanger"> *</Text> : null}
        </Text>
      ) : null}
      {control}
      {error ? (
        <Text variant="bodySm" color="statusDanger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="bodySm" color="inkMuted">
          {helper}
        </Text>
      ) : null}
    </Box>
  );
}
