/**
 * KeyValueRow — matches Figma `KeyValueRow` (124:93): label (Body/M, ink/muted)
 * left, value (Label/L, SemiBold) right; tone sets the value colour. Muted tones
 * both label + value.
 */
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

export function KeyValueRow({ label, value, tone = 'default', emphasize = false }: KeyValueRowProps): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingVertical="200">
      <Text variant="body" color={tone === 'muted' ? 'inkMuted' : 'inkMuted'}>
        {label}
      </Text>
      <Text
        color={VALUE_COLOR[tone]}
        style={{
          fontFamily: emphasize ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_600SemiBold',
          fontSize: emphasize ? 17 : 15,
          lineHeight: emphasize ? 22 : 20,
          letterSpacing: emphasize ? -0.2 : 0,
        }}
      >
        {value}
      </Text>
    </Box>
  );
}
