/**
 * OptionCard — selectable card with optional leading icon + subtitle (Figma
 * OptionCard: Selected + Has subtitle + Has leading icon). Used for role choice.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { IconCircle, type CircleTone } from './IconCircle.js';
import { Icon, type IconName } from './Icon.js';

interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: CircleTone;
  selected?: boolean;
  onPress?: () => void;
}

export function OptionCard({
  title,
  subtitle,
  icon,
  iconTone = 'brand',
  selected = false,
  onPress,
}: OptionCardProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
      <Box
        flexDirection="row"
        alignItems="center"
        gap="400"
        padding="400"
        borderRadius="lg"
        borderWidth={selected ? 2 : 1}
        style={{
          borderColor: selected ? theme.colors.brandEmerald : theme.colors.borderDefault,
          backgroundColor: selected ? theme.colors.brandBg : theme.colors.bgSurface,
        }}
      >
        {icon ? <IconCircle icon={icon} tone={iconTone} /> : null}
        <Box flex={1}>
          <Text variant="title">{title}</Text>
          {subtitle ? (
            <Text variant="bodySm" color="inkMuted" marginTop="100">
              {subtitle}
            </Text>
          ) : null}
        </Box>
        <Icon name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? 'brandEmerald' : 'borderStrong'} />
      </Box>
    </Pressable>
  );
}
