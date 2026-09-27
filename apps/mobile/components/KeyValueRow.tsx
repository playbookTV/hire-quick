/** Figma value row: wrapping label and amount with semantic typography. */
import { Box, Text } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

export type KvTone = 'default' | 'success' | 'brand' | 'danger' | 'muted';

const VALUE_COLOR: Record<KvTone, keyof Theme['colors']> = {
  default: 'inkStrong',
  success: 'statusSuccess',
  brand: 'brandEmerald',
  danger: 'statusDanger',
  muted: 'inkMuted',
};

interface KeyValueRowProps {
  label: string;
  value: string;
  tone?: KvTone;
  emphasize?: boolean;
}

export function KeyValueRow({
  label,
  value,
  tone = 'default',
  emphasize = false,
}: KeyValueRowProps): React.JSX.Element {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      paddingVertical="200"
      flexWrap="wrap"
      gap="200"
    >
      <Text variant="body" color="inkMuted" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Text
        color={VALUE_COLOR[tone]}
        variant={emphasize ? 'amountM' : 'labelLg'}
        style={{ flexShrink: 1 }}
      >
        {value}
      </Text>
    </Box>
  );
}
