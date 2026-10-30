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
        {primary ? (
          <Icon name={icon} size={22} color="inkOnPrimary" />
        ) : (
          <Box
            alignSelf="flex-start"
            padding="200"
            backgroundColor="brandAccentSubtle"
            borderRadius="xl"
          >
            <Icon name={icon} size={22} color="brandAccent" />
          </Box>
        )}
        <Text variant="labelLg" color={primary ? 'inkOnPrimary' : 'inkStrong'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color={primary ? 'inkOnPrimary' : 'inkMuted'}>
            {subtitle}
          </Text>
        ) : null}
      </Box>
    </Pressable>
  );
}
