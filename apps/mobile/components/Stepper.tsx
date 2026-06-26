/**
 * Stepper — matches Figma `Stepper` (152:92): − value + . Round 48px buttons with
 * a 1.5px border/strong ring and emerald icons; value is Heading/M (Fraunces
 * 22/28), centred and flexible. Clamps to [min, max].
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
      accessibilityRole="button"
      accessibilityLabel={name === 'minus' ? 'Decrease' : 'Increase'}
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
      <Text variant="h2" style={{ flex: 1, textAlign: 'center' }}>
        {value}
      </Text>
      {btn(inc, 'plus', value >= max)}
    </Box>
  );
}
