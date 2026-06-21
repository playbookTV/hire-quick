/**
 * Toggle — matches Figma `Toggle` (120:78): a 46×28 pill. On = emerald track,
 * knob right; Off = bg/inset track, knob left. 22px white knob with a soft
 * shadow.
 */
import { Pressable } from 'react-native';
import { useTheme, Box } from '../theme/restyle.js';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ value, onChange }: ToggleProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={8}>
      <Box
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          paddingHorizontal: 3,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? theme.colors.brandEmerald : theme.colors.bgInset,
        }}
      >
        <Box
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.colors.bgSurface,
            shadowColor: '#0F0F10',
            shadowOpacity: 0.18,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        />
      </Box>
    </Pressable>
  );
}
