/**
 * OptionCard — matches Figma `OptionCard` (93:34): selectable row, radius md.
 * Unselected = white surface + 1px border + 1.5px ring; selected = emerald-tint-
 * weak fill + 2px emerald border + emerald check circle. Optional 40px leading
 * icon chip; Title/L + Body/S text.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import type { Theme } from '../theme/theme.js';

interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'brand' | 'gold';
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
  const chipBg: keyof Theme['colors'] = iconTone === 'gold' ? 'accentGoldTint' : 'brandEmeraldTint';
  const chipFg: keyof Theme['colors'] = iconTone === 'gold' ? 'accentGoldStrong' : 'brandEmerald';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.94 : 1 })}>
      <Box
        flexDirection="row"
        alignItems="center"
        padding="400"
        borderRadius="md"
        borderWidth={selected ? 2 : 1}
        style={{
          gap: 16,
          borderColor: selected ? theme.colors.brandEmerald : theme.colors.borderDefault,
          backgroundColor: selected ? theme.colors.brandEmeraldTintWeak : theme.colors.bgSurface,
        }}
      >
        {icon ? (
          <Box
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors[chipBg],
            }}
          >
            <Icon name={icon} size={22} color={chipFg} />
          </Box>
        ) : null}

        <Box flex={1}>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySm" color="inkMuted">
              {subtitle}
            </Text>
          ) : null}
        </Box>

        <Box
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: selected ? 0 : 1.5,
            borderColor: theme.colors.borderStrong,
            backgroundColor: selected ? theme.colors.brandEmerald : theme.colors.bgSurface,
          }}
        >
          {selected ? <Icon name="check" size={13} color="inverseInk" /> : null}
        </Box>
      </Box>
    </Pressable>
  );
}
