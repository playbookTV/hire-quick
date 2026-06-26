/**
 * StaffCard — matches Figma `StaffCard` (90:16): Avatar + name (Title/M) with an
 * optional Verified badge, a star + meta line (Body/S), a price (Amount/M) with
 * "/event", and a trailing secondary "Invite" button.
 */
import { memo } from 'react';
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Badge } from './Badge.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { shadowSm } from '../theme/shadows.js';

interface StaffCardProps {
  name: string;
  meta: string;
  price: string;
  /** Unit shown after the price (e.g. "/day"). Omitted when empty so a bare label renders alone. */
  priceSuffix?: string;
  verified?: boolean;
  actionLabel?: string;
  avatarUrl?: string | null;
  onAction?: () => void;
  onPress?: () => void;
}

export const StaffCard = memo(function StaffCard({
  name,
  meta,
  price,
  priceSuffix = '/event',
  verified = false,
  actionLabel = 'Invite',
  avatarUrl,
  onAction,
  onPress,
}: StaffCardProps): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.9 : 1 })}>
      <Box
        flexDirection="row"
        alignItems="center"
        backgroundColor="bgSurface"
        borderWidth={1}
        borderColor="borderDefault"
        borderRadius="lg"
        padding="400"
        style={[{ gap: 16 }, shadowSm]}
      >
        <Avatar name={name} size={48} imageUrl={avatarUrl} />
        <Box flex={1} style={{ gap: 4 }}>
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            <Text variant="titleM" numberOfLines={1}>
              {name}
            </Text>
            {verified ? <Badge /> : null}
          </Box>
          <Box flexDirection="row" alignItems="center" style={{ gap: 4 }}>
            <Icon name="star" size={14} color="accentGold" />
            <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
              {meta}
            </Text>
          </Box>
          <Box flexDirection="row" alignItems="baseline" style={{ gap: 4 }}>
            <Text variant="amountM">{price}</Text>
            {priceSuffix ? (
              <Text variant="bodySm" color="inkMuted">
                {priceSuffix}
              </Text>
            ) : null}
          </Box>
        </Box>
        <Button label={actionLabel} variant="secondary" size="md" fullWidth={false} onPress={onAction} />
      </Box>
    </Pressable>
  );
});
