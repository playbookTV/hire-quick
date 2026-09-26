import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Icon } from './Icon.js';

export function ScreenHeading({
  title,
  subtitle,
  right,
}: Readonly<{
  title: string;
  subtitle?: string;
  right?: ReactNode;
}>): React.JSX.Element {
  return (
    <Box flexDirection="row" alignItems="center" gap="300">
      <Box flex={1} gap="100">
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="inkMuted">
            {subtitle}
          </Text>
        ) : null}
      </Box>
      {right}
    </Box>
  );
}

export function HomeHeading({
  name,
  unread,
  onNotifications,
}: Readonly<{
  name: string;
  unread: number;
  onNotifications: () => void;
}>): React.JSX.Element {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <Box flexDirection="row" alignItems="center" gap="300">
      <Box flex={1} gap="100">
        <Text variant="body" color="inkMuted">
          {greeting}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {name.trim().split(' ')[0]}
        </Text>
      </Box>
      <Pressable
        onPress={onNotifications}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Box
          width={38}
          height={38}
          borderRadius="pill"
          backgroundColor="bgSurface"
          borderWidth={1}
          borderColor="borderDefault"
          alignItems="center"
          justifyContent="center"
        >
          <Icon name="bell" size={20} color="inkStrong" />
          {unread > 0 ? (
            <Box
              position="absolute"
              top={-5}
              right={-5}
              backgroundColor="brandAccent"
              borderRadius="pill"
              minWidth={20}
              minHeight={20}
              alignItems="center"
              justifyContent="center"
              paddingHorizontal="100"
            >
              <Text variant="labelSm" color="inkOnAccent">
                {unread > 9 ? '9+' : unread}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Pressable>
    </Box>
  );
}
