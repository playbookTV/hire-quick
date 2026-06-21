/**
 * Stepper — Figma number stepper (− value +). Clamps to [min, max].
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon } from './Icon.js';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1 }: StepperProps): React.JSX.Element {
  const theme = useTheme();
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  const btn = (onPress: () => void, name: 'minus' | 'plus', disabled: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: theme.borderRadii.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bgMuted,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={name} size={18} color="inkStrong" />
    </Pressable>
  );

  return (
    <Box flexDirection="row" alignItems="center" gap="400">
      {btn(dec, 'minus', value <= min)}
      <Text variant="amount" style={{ minWidth: 40, textAlign: 'center' }}>
        {value}
      </Text>
      {btn(inc, 'plus', value >= max)}
    </Box>
  );
}
