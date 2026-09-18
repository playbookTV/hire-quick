/**
 * QuickActionCard — matches Figma `QuickActionCard` (122:86): a tile with a 40px
 * rounded icon chip, a Title/M, and a Body/S subtitle. Primary = emerald fill
 * (white text, darker icon chip); Surface = white panel (ink text, emerald-tint
 * chip + emerald icon).
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { shadowSm } from '../theme/shadows.js';

interface QuickActionCardProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  variant?: 'primary' | 'surface';
  onPress?: () => void;
}

export function QuickActionCard({
  title,
  subtitle,
  icon,
  variant = 'surface',
  onPress,
}: QuickActionCardProps): React.JSX.Element {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.92 : 1 })}
    >
      <Box
        padding="400"
        borderRadius="lg"
        borderWidth={primary ? 0 : 1}
        style={[
          {
            gap: 12,
            backgroundColor: primary ? theme.colors.brandSurface : theme.colors.bgSurface,
            borderColor: theme.colors.borderDefault,
          },
          shadowSm,
        ]}
      >
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.borderRadii.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: primary
              ? theme.colors.brandEmeraldStrong
              : theme.colors.brandEmeraldTint,
          }}
        >
          <Icon name={icon} size={22} color={primary ? 'inverseInk' : 'brandEmerald'} />
        </Box>
        <Text variant="titleM" color={primary ? 'inverseInk' : 'inkStrong'}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 13,
              lineHeight: 18,
              color: primary ? theme.colors.brandEmeraldTint : theme.colors.inkMuted,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </Box>
    </Pressable>
  );
}
