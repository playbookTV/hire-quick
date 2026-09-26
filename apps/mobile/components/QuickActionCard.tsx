import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

export function QuickActionCard({
  title,
  subtitle,
  icon,
  variant = 'surface',
  onPress,
}: Readonly<{
  title: string;
  subtitle?: string;
  icon: IconName;
  variant?: 'primary' | 'surface';
  onPress?: () => void;
}>): React.JSX.Element {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.75 : 1 })}
    >
      <Box
        flex={1}
        padding="400"
        borderRadius="md"
        borderWidth={1}
        borderColor={primary ? 'brandAccent' : 'borderDefault'}
        backgroundColor={primary ? 'brandAccent' : 'bgSurface'}
        gap="200"
      >
        <Icon name={icon} size={22} color={primary ? 'inkOnAccent' : 'inkStrong'} />
        <Text variant="labelLg" color={primary ? 'inkOnAccent' : 'inkStrong'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color={primary ? 'inkOnAccent' : 'inkMuted'}>
            {subtitle}
          </Text>
        ) : null}
      </Box>
    </Pressable>
  );
}
