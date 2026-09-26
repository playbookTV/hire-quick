import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';

/** Figma PreferenceRow: one generous target, with wrapping labels and optional live detail. */
export function PreferenceRow({
  icon,
  label,
  detail,
  onPress,
  disabled = false,
}: Readonly<{
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
}>): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingVertical: 12,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <Box flexDirection="row" alignItems="center" gap="300">
        <Icon name={icon} size={18} color="inkMuted" />
        <Text variant="labelLg" style={{ flex: 1 }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="bodySm" color="inkMuted" style={{ maxWidth: '35%' }}>
            {detail}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={16} color="inkMuted" />
      </Box>
    </Pressable>
  );
}
