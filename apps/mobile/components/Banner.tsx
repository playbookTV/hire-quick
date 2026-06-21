/**
 * Banner — inline notice (Figma Banner: Tone Info/Warning/Success/Brand).
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

export type BannerTone = 'info' | 'warning' | 'success' | 'brand';

const TONE: Record<BannerTone, { fg: keyof Theme['colors']; bg: keyof Theme['colors']; icon: IconName }> = {
  info: { fg: 'statusInfo', bg: 'infoBg', icon: 'info' },
  warning: { fg: 'statusWarning', bg: 'warningBg', icon: 'alert-triangle' },
  success: { fg: 'statusSuccess', bg: 'successBg', icon: 'check-circle' },
  brand: { fg: 'brandEmerald', bg: 'brandBg', icon: 'shield' },
};

interface BannerProps {
  tone?: BannerTone;
  title?: string;
  message: string;
}

export function Banner({ tone = 'info', title, message }: BannerProps): React.JSX.Element {
  const theme = useTheme();
  const t = TONE[tone];
  return (
    <Box
      flexDirection="row"
      gap="300"
      padding="400"
      borderRadius="md"
      style={{ backgroundColor: theme.colors[t.bg] }}
    >
      <Icon name={t.icon} size={20} color={t.fg} />
      <Box flex={1}>
        {title ? (
          <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: theme.colors[t.fg] }}>
            {title}
          </Text>
        ) : null}
        <Text variant="bodySm" color="inkBody" marginTop={title ? '100' : 'none'}>
          {message}
        </Text>
      </Box>
    </Box>
  );
}
