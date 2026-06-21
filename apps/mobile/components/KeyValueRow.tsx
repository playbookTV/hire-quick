/**
 * KeyValueRow — label left, value right, with a tone for the value (Figma
 * KeyValueRow: Tone Default/Success/Brand/Danger/Muted). Used in review/summary.
 */
import { Box, Text } from '../theme/restyle.js';
import type { Theme } from '../theme/theme.js';

export type KvTone = 'default' | 'success' | 'brand' | 'danger' | 'muted';

const TONE: Record<KvTone, keyof Theme['colors']> = {
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

export function KeyValueRow({ label, value, tone = 'default', emphasize = false }: KeyValueRowProps): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingVertical="200">
      <Text variant="body" color="inkMuted">
        {label}
      </Text>
      <Text
        color={TONE[tone]}
        style={{
          fontFamily: emphasize ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_600SemiBold',
          fontSize: emphasize ? 16 : 15,
        }}
      >
        {value}
      </Text>
    </Box>
  );
}
