/**
 * Chip — matches Figma `Chip` (85:14): pill, 16/8 padding. Selected = solid
 * emerald with inverse-ink label; unselected = white surface with a 1.5px
 * border/strong and ink/default label (Label/M).
 */
import { useTheme, Text } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected = false, onPress }: ChipProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: theme.borderRadii.pill,
        borderWidth: selected ? 0 : 1.5,
        borderColor: theme.colors.borderStrong,
        backgroundColor: selected ? theme.colors.brandEmerald : theme.colors.bgSurface,
      }}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: 13,
          lineHeight: 16,
          letterSpacing: 0.2,
          color: selected ? theme.colors.inverseInk : theme.colors.inkDefault,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
