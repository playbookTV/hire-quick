/**
 * JobCard — matches Figma `JobCard` (91:21): title (Title/M) + pay (Amount/M,
 * emerald) on one row; a date/distance meta row; then a dress chip + star/rating
 * with a trailing primary "Apply" button.
 */
import { Pressable } from 'react-native';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { AnimatedPressable } from './Pressable.js';
import { shadowSm } from '../theme/shadows.js';

type BadgeTone = 'gold' | 'emerald' | 'danger' | 'muted';

interface JobCardProps {
  title: string;
  pay: string;
  date: string;
  distance: string;
  dress?: string;
  rating?: string;
  badge?: string;
  badgeTone?: BadgeTone;
  saved?: boolean;
  onToggleSave?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
}

const BADGE_COLORS: Record<BadgeTone, { bg: keyof ReturnType<typeof useTheme>['colors']; fg: keyof ReturnType<typeof useTheme>['colors'] }> = {
  gold: { bg: 'accentGoldTint', fg: 'accentGoldStrong' },
  emerald: { bg: 'brandEmeraldTintWeak', fg: 'brandEmerald' },
  danger: { bg: 'bgSubtle', fg: 'statusDanger' },
  muted: { bg: 'bgSubtle', fg: 'inkMuted' },
};

export function JobCard({
  title,
  pay,
  date,
  distance,
  dress,
  rating,
  badge,
  badgeTone = 'gold',
  saved,
  onToggleSave,
  actionLabel = 'Apply',
  onAction,
  onPress,
}: JobCardProps): React.JSX.Element {
  const theme = useTheme();
  const badgeColor = BADGE_COLORS[badgeTone];
  const card = (
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
          {onToggleSave ? (
            <Pressable onPress={onToggleSave} hitSlop={8}>
              <Icon name="bookmark" size={18} color={saved ? 'brandEmerald' : 'inkFaint'} />
            </Pressable>
          ) : null}
          <Text variant="amountM" color="brandEmerald">
            {pay}
          </Text>
        </Box>

        {badge ? (
          <Box style={{ alignSelf: 'flex-start', backgroundColor: theme.colors[badgeColor.bg], paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.borderRadii.pill }}>
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 1 }} color={badgeColor.fg}>
              {badge}
            </Text>
          </Box>
        ) : null}

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
          {onAction ? (
            <Button label={actionLabel} variant="primary" size="md" fullWidth={false} onPress={onAction} />
          ) : null}
        </Box>
      </Box>
  );

  if (!onPress) return card;
  return <AnimatedPressable onPress={onPress}>{card}</AnimatedPressable>;
}
