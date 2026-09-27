/** Figma StaffCard: full-width identity, reputation and indicative rate. */
import { memo } from 'react';
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Avatar } from './Avatar.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';

interface StaffCardProps {
  name: string;
  meta: string;
  price: string;
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
  priceSuffix = '',
  verified = false,
  actionLabel = 'Invite',
  avatarUrl,
  onAction,
  onPress,
}: StaffCardProps) {
  return (
    <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg">
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${name}${verified ? ', identity verified' : ''}, ${meta}, ${price} ${priceSuffix}`}
        style={({ pressed }) => ({ padding: 16, opacity: pressed ? 0.75 : 1 })}
      >
        <Box flexDirection="row" alignItems="flex-start" gap="400">
          <Avatar name={name} size={56} imageUrl={avatarUrl} tone="accent" />
          <Box flex={1} gap="100" style={{ minWidth: 0 }}>
            <Box flexDirection="row" alignItems="flex-start" gap="200">
              <Text variant="labelLg" style={{ flex: 1 }}>
                {name}
              </Text>
              {verified ? (
                <Box
                  width={20}
                  height={20}
                  borderRadius="pill"
                  backgroundColor="statusSuccess"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon name="check" size={13} color="bgSurface" />
                </Box>
              ) : null}
            </Box>
            <Box flexDirection="row" alignItems="flex-start" gap="150">
              <Icon name="star" size={14} color="brandAccentText" />
              <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>
                {meta}
              </Text>
            </Box>
            <Text variant="bodySm" color="inkDefault">
              {price}
              {priceSuffix ? ` ${priceSuffix}` : ''}
            </Text>
          </Box>
        </Box>
      </Pressable>
      {onAction ? (
        <Box paddingHorizontal="400" paddingBottom="400">
          <Button label={actionLabel} variant="secondary" size="md" onPress={onAction} />
        </Box>
      ) : null}
    </Box>
  );
});
