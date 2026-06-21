/**
 * JobCard — matches Figma `JobCard` (91:21): title (Title/M) + pay (Amount/M,
 * emerald) on one row; a date/distance meta row; then a dress chip + star/rating
 * with a trailing primary "Apply" button.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { shadowSm } from '../theme/shadows.js';

interface JobCardProps {
  title: string;
  pay: string;
  date: string;
  distance: string;
  dress?: string;
  rating?: string;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
}

export function JobCard({
  title,
  pay,
  date,
  distance,
  dress,
  rating,
  actionLabel = 'Apply',
  onAction,
  onPress,
}: JobCardProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed && onPress ? 0.9 : 1 })}>
      <Box
        backgroundColor="bgSurface"
        borderWidth={1}
        borderColor="borderDefault"
        borderRadius="lg"
        padding="400"
        style={[{ gap: 12 }, shadowSm]}
      >
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" style={{ gap: 8 }}>
          <Text variant="titleM" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
          <Text variant="amountM" color="brandEmerald">
            {pay}
          </Text>
        </Box>

        <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
          <Icon name="calendar" size={15} color="inkMuted" />
          <Text variant="bodySm" color="inkMuted">
            {date}
          </Text>
          <Icon name="map-pin" size={15} color="inkMuted" />
          <Text variant="bodySm" color="inkMuted">
            {distance}
          </Text>
        </Box>

        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" alignItems="center" style={{ gap: 8 }}>
            {dress ? (
              <Box
                style={{
                  backgroundColor: theme.colors.bgSubtle,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: theme.borderRadii.pill,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PlusJakartaSans_600SemiBold',
                    fontSize: 13,
                    lineHeight: 16,
                    letterSpacing: 0.2,
                    color: theme.colors.inkDefault,
                  }}
                >
                  {dress}
                </Text>
              </Box>
            ) : null}
            {rating ? (
              <Box flexDirection="row" alignItems="center" style={{ gap: 3 }}>
                <Icon name="star" size={14} color="accentGold" />
                <Text variant="bodySm" color="inkMuted">
                  {rating}
                </Text>
              </Box>
            ) : null}
          </Box>
          <Button label={actionLabel} variant="primary" size="md" fullWidth={false} onPress={onAction} />
        </Box>
      </Box>
    </Pressable>
  );
}
