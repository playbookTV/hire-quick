/**
 * Banner — matches Figma `Banner` (119:92): tinted surface + 1px tinted border,
 * 18px icon, Body/S text in the tone colour, 16px padding / 12px gap / radius md.
 * Tones: Info / Warning / Success / Brand. `title` is an optional emphasis line.
 */
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { fonts } from '../theme/fonts.js';
import type { Theme } from '../theme/theme.js';

export type BannerTone = 'info' | 'warning' | 'success' | 'brand';

const TONE: Record<
  BannerTone,
  {
    fg: keyof Theme['colors'];
    bg: keyof Theme['colors'];
    border: keyof Theme['colors'];
    icon: IconName;
  }
> = {
  info: { fg: 'statusInfo', bg: 'statusInfoTint', border: 'borderDefault', icon: 'info' },
  warning: {
    fg: 'statusWarning',
    bg: 'statusWarningTint',
    border: 'borderDefault',
    icon: 'alert-triangle',
  },
  success: { fg: 'statusSuccess', bg: 'statusSuccessTint', border: 'borderDefault', icon: 'check' },
  brand: {
    fg: 'brandEmerald',
    bg: 'brandEmeraldTintWeak',
    border: 'borderDefault',
    icon: 'shield',
  },
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
      alignItems="center"
      style={{
        gap: 12,
        padding: 16,
        borderRadius: theme.borderRadii.md,
        backgroundColor: theme.colors[t.bg],
        borderWidth: 1,
        borderColor: theme.colors[t.border],
      }}
    >
      <Icon name={t.icon} size={18} color={t.fg} />
      <Box flex={1}>
        {title ? (
          <Text
            style={{
              fontFamily: fonts.sansSemibold,
              fontSize: 13,
              lineHeight: 18,
              color: theme.colors[t.fg],
            }}
          >
            {title}
          </Text>
        ) : null}
        <Text
          style={{
            fontFamily: fonts.sansRegular,
            fontSize: 13,
            lineHeight: 18,
            color: theme.colors[t.fg],
          }}
        >
          {message}
        </Text>
      </Box>
    </Box>
  );
}
