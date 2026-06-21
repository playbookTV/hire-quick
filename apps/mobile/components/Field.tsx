/**
 * Field — label + control + helper/error. Wraps any input. The error text
 * replaces the helper when present (Figma Field: Label/Helper).
 */
import type { ReactNode } from 'react';
import { Box, Text } from '../theme/restyle.js';

interface FieldProps {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, helper, error, required, children }: FieldProps): React.JSX.Element {
  return (
    <Box marginBottom="400">
      {label ? (
        <Box flexDirection="row" marginBottom="200">
          <Text variant="label">{label}</Text>
          {required ? (
            <Text variant="label" color="statusDanger">
              {' *'}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {children}
      {error ? (
        <Text variant="bodySm" color="statusDanger" marginTop="150">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="bodySm" color="inkMuted" marginTop="150">
          {helper}
        </Text>
      ) : null}
    </Box>
  );
}
