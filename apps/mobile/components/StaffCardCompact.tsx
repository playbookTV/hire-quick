/**
 * StaffCardCompact — matches Figma `StaffCardCompact` (127:78): vertical staff
 * tile for grids/carousels. Avatar, name (Title/M), optional Verified badge,
 * star + rating (Body/S), price (Amount/M) + "/event".
 */
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Badge } from './Badge.js';
import { Icon } from './Icon.js';
import { shadowSm } from '../theme/shadows.js';

interface StaffCardCompactProps {
  name: string;
  rating: string;
  price: string;
  verified?: boolean;
  onPress?: () => void;
}

export function StaffCardCompact({
  name,
  rating,
  price,
  verified = false,
  onPress,
}: StaffCardCompactProps): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed && onPress ? 0.9 : 1 })}>
      <Box
        backgroundColor="bgSurface"
        borderWidth={1}
        borderColor="borderDefault"
        borderRadius="lg"
        padding="400"
        style={[{ gap: 8 }, shadowSm]}
      >
        <Avatar name={name} size={48} />
        <Text variant="titleM" numberOfLines={1}>
          {name}
        </Text>
        {verified ? <Badge /> : null}
        <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
          <Icon name="star" size={14} color="accentGold" />
          <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
            {rating}
          </Text>
        </Box>
        <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
          <Text variant="amountM">{price}</Text>
          <Text variant="bodySm" color="inkMuted">
            /event
          </Text>
        </Box>
      </Box>
    </Pressable>
  );
}
