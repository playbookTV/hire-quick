/**
 * QuickActionCard — icon + title tap target (Figma QuickActionCard:
 * Primary/Surface). Primary = emerald fill; Surface = bordered panel.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

interface QuickActionCardProps {
  title: string;
  icon: IconName;
  variant?: 'primary' | 'surface';
  onPress?: () => void;
}

export function QuickActionCard({
  title,
  icon,
  variant = 'surface',
  onPress,
}: QuickActionCardProps): React.JSX.Element {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.92 : 1 })}>
      <Box
        padding="400"
        borderRadius="lg"
        borderWidth={primary ? 0 : 1}
        gap="300"
        style={{
          backgroundColor: primary ? theme.colors.brandEmerald : theme.colors.bgSurface,
          borderColor: theme.colors.borderDefault,
          minHeight: 104,
          justifyContent: 'space-between',
        }}
      >
        <Icon name={icon} size={24} color={primary ? 'inverseInk' : 'brandEmerald'} />
        <Text
          style={{
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 15,
            color: primary ? theme.colors.inverseInk : theme.colors.inkStrong,
          }}
        >
          {title}
        </Text>
      </Box>
    </Pressable>
  );
}
