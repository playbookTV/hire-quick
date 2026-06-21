/**
 * Chip — selectable filter pill (Figma Chip: Selected variant + Label).
 */
import { Pressable } from 'react-native';
import { useTheme, Text } from '../theme/restyle.js';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected = false, onPress }: ChipProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: theme.borderRadii.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandEmerald : theme.colors.borderDefault,
        backgroundColor: selected ? theme.colors.brandEmerald : theme.colors.bgSurface,
      }}
    >
      <Text
        style={{
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: 13,
          color: selected ? theme.colors.inverseInk : theme.colors.inkBody,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
