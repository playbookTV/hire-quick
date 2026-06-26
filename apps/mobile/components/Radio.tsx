/**
 * Radio — matches Figma `Radio` (148:146): a 20px control. Unselected = canvas
 * fill with a soft ring; selected = emerald fill with a white centre dot.
 */
import { Pressable } from 'react-native';
import { useTheme, Box } from '../theme/restyle.js';

interface RadioProps {
  selected?: boolean;
  onPress?: () => void;
  size?: number;
  /** Spoken name of this option, e.g. "Client". */
  label?: string;
}

export function Radio({ selected = false, onPress, size = 20, label }: RadioProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Box
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 1 : 1.5,
          borderColor: selected ? theme.colors.brandEmeraldStrong : theme.colors.borderStrong,
          backgroundColor: selected ? theme.colors.brandEmerald : theme.colors.bgCanvas,
        }}
      >
        {selected ? (
          <Box
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderRadius: size * 0.2,
              backgroundColor: theme.colors.bgSurface,
            }}
          />
        ) : null}
      </Box>
    </Pressable>
  );
}
