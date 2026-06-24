/**
 * ListItem — matches Figma `ListItem` (122:87): leading icon + Title/Subtitle +
 * trailing text action. Bordered surface, radius md, 16px padding.
 */
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Icon, type IconName } from './Icon.js';
import { AnimatedPressable } from './Pressable.js';

interface ListItemProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
}

export function ListItem({ icon, title, subtitle, actionLabel, onAction, onPress }: ListItemProps): React.JSX.Element {
  const row = (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor="bgSurface"
      borderWidth={1}
      borderColor="borderDefault"
      borderRadius="md"
      padding="400"
      style={{ gap: 12 }}
    >
      {icon ? <Icon name={icon} size={20} color="inkStrong" /> : null}
      <Box flex={1}>
        <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color="inkMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Box>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text
            style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 16, letterSpacing: 0.2 }}
            color="brandEmerald"
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Box>
  );

  if (!onPress) return row;
  return <AnimatedPressable onPress={onPress}>{row}</AnimatedPressable>;
}
