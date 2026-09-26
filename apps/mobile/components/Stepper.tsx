/**
 * Stepper — round 48px controls with stable numeric alignment. Clamps to [min, max].
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon } from './Icon.js';
import { numericTypography } from '../theme/token-manager.js';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  accessibilityLabel = 'Value',
  accessibilityHint,
}: StepperProps): React.JSX.Element {
  const theme = useTheme();
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  const btn = (onPress: () => void, name: 'minus' | 'plus', disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name === 'minus' ? 'Decrease' : 'Increase'} ${accessibilityLabel}. Current value ${value}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bgSurface,
        borderWidth: 1.5,
        borderColor: theme.colors.borderStrong,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={name} size={22} color="brandEmerald" />
    </Pressable>
  );

  return (
    <Box flexDirection="row" alignItems="center" style={{ gap: 16 }}>
      {btn(dec, 'minus', value <= min)}
      <Text variant="h2" style={{ flex: 1, textAlign: 'center', ...numericTypography }}>
        {value}
      </Text>
      {btn(inc, 'plus', value >= max)}
    </Box>
  );
}
