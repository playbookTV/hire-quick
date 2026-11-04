import { Pressable } from 'react-native';
import { Box, Text, useTheme } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { fonts } from '../theme/fonts.js';

/** Figma PreferenceRow: one generous target, with wrapping labels and optional live detail. */
export function PreferenceRow({
  icon,
  label,
  detail,
  onPress,
  disabled = false,
  variant = 'default',
}: Readonly<{
  icon?: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'default' | 'navigation';
}>): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: theme.spacing[variant === 'navigation' ? '1400' : '1200'],
        paddingVertical: theme.spacing['300'],
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <Box flexDirection="row" alignItems="center" gap="300">
        {icon ? <Icon name={icon} size={18} color="inkMuted" /> : null}
        <Text
          variant="labelLg"
          style={{
            flex: 1,
            ...(variant === 'navigation' ? { fontFamily: fonts.sansMedium } : {}),
          }}
        >
          {label}
        </Text>
        {detail ? (
          <Text variant="bodySm" color="inkMuted" style={{ maxWidth: '35%' }}>
            {detail}
          </Text>
        ) : null}
        <Icon name="chevron-right" size={variant === 'navigation' ? 20 : 16} color="inkMuted" />
      </Box>
    </Pressable>
  );
}
